import requests
from bs4 import BeautifulSoup
import json
import re
from html import unescape

def download_cofepris_mexico():
    print("=== Step 1: Fetching Complete COFEPRIS Mexico Registry ===")
    url = 'https://siipris03.cofepris.gob.mx/resoluciones/consultas/conwebregensayosclinicos.asp'
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': 'https://siipris03.cofepris.gob.mx',
        'Referer': url
    }

    all_studies = []
    seen_ids = set()

    # Query multiple letters to ensure full 5,545 coverage
    search_queries = ['a', 'e', 'i', 'o', 'u', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0']
    options = ['denom_generica', 'problema_estudio', 'AreaTerapeutica', 'NomPatrocinador', 'no_protocolo']

    for opt in ['denom_generica', 'problema_estudio']:
        for q in search_queries:
            offsets = [0, 500, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5500]
            for offset in offsets:
                page_url = url if offset == 0 else f"{url}?OptionSelect={opt}&TxtBuscar={q}&MM_Buscar=FrmBuscar&button=Buscar&EntBuscar=&offset={offset}"
                data = {
                    'OptionSelect': opt,
                    'TxtBuscar': q,
                    'EntBuscar': '',
                    'MM_Buscar': 'FrmBuscar',
                    'button': 'Buscar'
                }

                try:
                    r = requests.post(page_url, headers=headers, data=data, verify=False, timeout=15)
                    html = r.content.decode('iso-8859-1', errors='ignore')
                    soup = BeautifulSoup(html, 'html.parser')

                    tables = soup.find_all('table')
                    target_table = None
                    for t in tables:
                        rows = t.find_all('tr')
                        if len(rows) > 5:
                            target_table = t
                            break

                    if not target_table:
                        break

                    rows = target_table.find_all('tr')
                    added_in_page = 0
                    for idx, row in enumerate(rows[3:]):
                        cells = row.find_all(['td', 'th'])
                        if len(cells) < 2:
                            continue

                        protocolo = cells[0].get_text(strip=True)
                        titulo = cells[1].get_text(strip=True)

                        if not protocolo and not titulo:
                            continue

                        id_solicitud = ""
                        links = row.find_all('a')
                        for a in links:
                            onclick = a.get('onclick') or a.get('href') or ''
                            m = re.search(r'SelFicha\((\d+)\)', onclick)
                            if m:
                                id_solicitud = m.group(1)
                                break

                        uid = id_solicitud if id_solicitud else f"{protocolo}_{titulo[:30]}"
                        if uid in seen_ids:
                            continue
                        seen_ids.add(uid)
                        added_in_page += 1

                        clean_title = unescape(titulo) if titulo else "Estudio Clínico COFEPRIS"
                        clean_proto = protocolo if protocolo else (f"COFEPRIS-{id_solicitud}" if id_solicitud else f"MX-{len(all_studies)+1}")

                        all_studies.append({
                            'radicado': clean_proto,
                            'nct_id': id_solicitud if id_solicitud else clean_proto,
                            'titulo': clean_title,
                            'estado_operativo': 'AUTORIZADO COFEPRIS',
                            'estado_tabla': 'AUTORIZADO COFEPRIS',
                            'fase_tabla': 'N/A',
                            'patrocinador_cro': 'Patrocinador COFEPRIS México',
                            'patrocinador_tabla': 'Patrocinador COFEPRIS México',
                            'especialidades': 'Ensaios Clínicos COFEPRIS México',
                            'fecha_radicacion': 'COFEPRIS México',
                            'fecha_acto_administrativo': 'COFEPRIS México',
                            'palabra_clave': f"Protocolo: {clean_proto} | ID Solicitud: {id_solicitud}",
                            'pais_origen': 'México (COFEPRIS)',
                            'enlace_registro_primario': f"https://siipris03.cofepris.gob.mx/resoluciones/consultas/ConWebRegEnsayosClinicosDetalle.asp?idsolicitud={id_solicitud}" if id_solicitud else url,
                            'full_url': f"https://siipris03.cofepris.gob.mx/resoluciones/consultas/ConWebRegEnsayosClinicosDetalle.asp?idsolicitud={id_solicitud}" if id_solicitud else url,
                            'concepto_regulatorio': 'AUTORIZADO COFEPRIS (MX)',
                            'numero_acto_administrativo': id_solicitud if id_solicitud else clean_proto,
                            'acta': f"Protocolo: {clean_proto} | ID Solicitud: {id_solicitud}"
                        })

                    if added_in_page == 0 and offset > 0:
                        break

                except Exception as e:
                    break

            print(f"Option '{opt}' query '{q}': Cumulative total = {len(all_studies)}")

    print(f"Total COFEPRIS Mexico studies mapped: {len(all_studies)}")

    # Save JSON
    json_path = "/home/camilo-q/.gemini/antigravity/scratch/invima-dashboard/cofepris_mexico.json"
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(all_studies, f, ensure_ascii=False, indent=2)
    print(f"Saved JSON to {json_path}")

    # Save JS bundle
    js_path = "/home/camilo-q/.gemini/antigravity/scratch/invima-dashboard/cofepris_mexico.js"
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write("window.COFEPRIS_MEXICO_DATASET = ")
        json.dump(all_studies, f, ensure_ascii=False)
        f.write(";")
    print(f"Saved JS bundle to {js_path}")

if __name__ == '__main__':
    download_cofepris_mexico()
