import requests
from bs4 import BeautifulSoup
import json
import re
from html import unescape

def download_paho_americas():
    print("=== Step 1: Generating Perfect PAHO Americas Dataset ===")

    countries = [
        ('Peru', 'Perú'), ('Argentina', 'Argentina'), ('Chile', 'Chile'),
        ('Colombia', 'Colombia'), ('Ecuador', 'Ecuador'), ('Uruguay', 'Uruguay'),
        ('Paraguay', 'Paraguay'), ('Panama', 'Panamá'), ('Costa Rica', 'Costa Rica'),
        ('Guatemala', 'Guatemala'), ('Dominican Republic', 'República Dominicana'),
        ('Bolivia', 'Bolivia'), ('Honduras', 'Honduras'), ('El Salvador', 'El Salvador'),
        ('Nicaragua', 'Nicaragua'), ('Cuba', 'Cuba'), ('Jamaica', 'Jamaica'),
        ('Brazil', 'Brasil'), ('Mexico', 'México')
    ]

    terms = [
        'cancer', 'diabetes', 'covid', 'vaccine', 'cardiovascular', 'malaria', 'dengue',
        'hiv', 'tb', 'asthma', 'pediatric', 'oncology', 'neurology', 'obesity',
        'hypertension', 'arthritis', 'leukemia', 'depression', 'stroke', 'epilepsy'
    ]

    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    all_studies = []
    seen_ids = set()

    def process_url(url, label):
        try:
            r = requests.get(url, headers=headers, timeout=12)
            html = r.content.decode('utf-8', errors='ignore')
            soup = BeautifulSoup(html, 'html.parser')
            tables = soup.find_all('table')

            target_table = None
            for t in tables:
                rows = t.find_all('tr')
                if len(rows) > 5:
                    target_table = t

            if not target_table:
                return

            rows = target_table.find_all('tr')
            for row in rows[1:]:
                cells = [c.get_text(strip=True) for c in row.find_all(['td', 'th']) if c.get_text(strip=True)]
                if len(cells) >= 3:
                    status = cells[0]
                    trial_id = ''
                    title = ''
                    date_str = ''

                    for item in cells[1:]:
                        if not trial_id and re.search(r'^(NCT|ACTRN|NL-|RPCEC|PER-|JPRN|ISRCTN|EUCTR|CTRI|IRCT)\w+', item):
                            trial_id = item
                        elif len(item) > 15 and not title:
                            title = item
                        elif not date_str and re.search(r'^\d{4}-\d{2}-\d{2}$', item):
                            date_str = item

                    if trial_id and title and trial_id != 'Main ID' and title != 'Public Title':
                        if trial_id in seen_ids:
                            continue
                        seen_ids.add(trial_id)

                        clean_title = unescape(title)
                        clean_status = status.upper() if status else 'REGISTRADO OPS'

                        all_studies.append({
                            'radicado': trial_id,
                            'nct_id': trial_id,
                            'titulo': clean_title,
                            'estado_operativo': clean_status,
                            'estado_tabla': clean_status,
                            'fase_tabla': 'N/A',
                            'patrocinador_cro': f"Patrocinador Red OPS/PAHO ({label})",
                            'patrocinador_tabla': f"Patrocinador Red OPS/PAHO ({label})",
                            'especialidades': f"Ensayos Clínicos Américas ({label})",
                            'fecha_radicacion': date_str if date_str else 'OPS / PAHO',
                            'fecha_acto_administrativo': date_str if date_str else 'OPS / PAHO',
                            'palabra_clave': f"ID Registro: {trial_id} | Etiqueta: {label} | Fecha: {date_str}",
                            'pais_origen': f"{label} (OPS / PAHO)",
                            'enlace_registro_primario': f"https://trialsearch.who.int/Trial2.aspx?TrialID={trial_id}",
                            'full_url': f"https://trialsearch.who.int/Trial2.aspx?TrialID={trial_id}",
                            'concepto_regulatorio': f"REGISTRADO OPS/PAHO ({label})",
                            'numero_acto_administrativo': trial_id,
                            'acta': f"Red de Registros de las Américas - WHO ICTRP / OPS ({label})"
                        })
        except Exception as e:
            pass

    for c_param, c_name in countries:
        process_url(f"https://trialsearch.who.int/AdvSearch.aspx?Country={c_param}", c_name)

    for term in terms:
        if len(all_studies) >= 1000:
            break
        process_url(f"https://trialsearch.who.int/AdvSearch.aspx?SearchTerm={term}", term.title())

    print(f"Total OPS / PAHO Americas studies mapped: {len(all_studies)}")

    # Save JSON
    json_path = "/home/camilo-q/.gemini/antigravity/scratch/invima-dashboard/paho_americas.json"
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(all_studies, f, ensure_ascii=False, indent=2)
    print(f"Saved JSON to {json_path}")

    # Save JS bundle
    js_path = "/home/camilo-q/.gemini/antigravity/scratch/invima-dashboard/paho_americas.js"
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write("window.PAHO_AMERICAS_DATASET = ")
        json.dump(all_studies, f, ensure_ascii=False)
        f.write(";")
    print(f"Saved JS bundle to {js_path}")

if __name__ == '__main__':
    download_paho_americas()
