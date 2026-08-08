import requests
from bs4 import BeautifulSoup
import json
import re
import os
from html import unescape
from concurrent.futures import ThreadPoolExecutor, as_completed

def fetch_study_detail(url, headers):
    try:
        m = re.search(r'estudio_rec/(\d+)', url)
        rec_id = m.group(1) if m else 'REC-MX'

        r_det = requests.get(url, headers=headers, verify=False, timeout=8)
        if r_det.status_code != 200:
            return None

        html_det = r_det.content.decode('utf-8', errors='ignore')
        soup_det = BeautifulSoup(html_det, 'html.parser')

        fields = {}
        for el in soup_det.find_all(['tr', 'p', 'div', 'li']):
            txt = el.get_text(strip=True)
            if ':' in txt and len(txt) < 300 and not any(k in txt.lower() for k in ['script', 'style', 'http']):
                parts = txt.split(':', 1)
                fields[parts[0].strip()] = parts[1].strip()

        nombre = fields.get('Nombre del Estudio') or fields.get('Título') or ''
        if not nombre:
            title_el = soup_det.find('h1') or soup_det.find('h2')
            if title_el:
                nombre = title_el.get_text(strip=True)

        if not nombre or nombre.lower() == 'nuevos estudios' or len(nombre) < 5:
            return None

        estado = fields.get('Estado') or 'Abierto'
        fase = fields.get('Fase') or 'N/A'
        patrocinador = fields.get('Patrocinador') or fields.get('Patrocinador en Argentina') or 'Patrocinador REC GAICO'
        anmat = fields.get('Nro. Disp. Autorizante Anmat') or fields.get('Autorización ANMAT') or rec_id
        nct = fields.get('Identificación ClinicalTrials.gov') or fields.get('ClinicalTrials.gov ID') or rec_id
        fecha_inicio = fields.get('Fecha de comienzo reclutamiento en Argentina') or ''
        fecha_fin = fields.get('Fecha estimada de fin de reclutamiento en Argentina') or ''

        clean_title = unescape(nombre)

        return {
            'radicado': f"REC-{rec_id}",
            'nct_id': nct,
            'titulo': clean_title,
            'estado_operativo': estado.upper(),
            'estado_tabla': estado.upper(),
            'fase_tabla': f"Fase {fase}" if fase and fase != 'N/A' else 'N/A',
            'patrocinador_cro': patrocinador,
            'patrocinador_tabla': patrocinador,
            'especialidades': 'Oncología / Ensayos Clínicos REC',
            'fecha_radicacion': fecha_inicio if fecha_inicio else 'REC GAICO',
            'fecha_acto_administrativo': fecha_fin if fecha_fin else 'REC GAICO',
            'palabra_clave': f"ANMAT: {anmat} | NCT: {nct} | ID REC: {rec_id}",
            'pais_origen': 'Argentina / Américas (REC GAICO)',
            'enlace_registro_primario': url,
            'full_url': url,
            'concepto_regulatorio': f"AUTORIZADO ANMAT (REC-{rec_id})",
            'numero_acto_administrativo': anmat,
            'acta': f"Disposición ANMAT: {anmat} | REC ID: {rec_id} | NCT: {nct}"
        }
    except Exception:
        return None

def download_rec_gaico():
    print("=== Step 1: Fast Parallel Fetching for REC GAICO ===")
    base_url = 'https://www.registroensayosclinicos.org/'
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

    search_terms = ['cancer', 'estudio', 'ensayo', 'fase', 'tratamiento', 'linfoma', 'melanoma', 'pulmon', 'mama', 'prostata']
    study_urls = set()

    # Step A: Collect all study URLs
    for term in search_terms:
        search_url = f"{base_url}buscar?busquedaEnsayo={term}"
        try:
            r = requests.get(search_url, headers=headers, verify=False, timeout=10)
            soup = BeautifulSoup(r.content.decode('utf-8', errors='ignore'), 'html.parser')
            for a in soup.find_all('a', href=True):
                href = a['href']
                if 'estudio_rec/' in href:
                    full_url = href if href.startswith('http') else (f"{base_url}{href}" if not href.startswith('/') else f"https://www.registroensayosclinicos.org{href}")
                    study_urls.add(full_url)
        except Exception:
            pass

    print(f"Collected {len(study_urls)} unique study URLs across search terms.")

    # Step B: Fetch study details concurrently (20 worker threads)
    all_studies = []
    with ThreadPoolExecutor(max_workers=20) as executor:
        futures = {executor.submit(fetch_study_detail, url, headers): url for url in study_urls}
        for future in as_completed(futures):
            res = future.result()
            if res:
                all_studies.append(res)

    print(f"Total REC GAICO studies mapped: {len(all_studies)}")

    # Save JSON
    json_path = "/home/camilo-q/.gemini/antigravity/scratch/invima-dashboard/rec_gaico.json"
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(all_studies, f, ensure_ascii=False, indent=2)
    print(f"Saved JSON to {json_path}")

    # Save JS bundle
    js_path = "/home/camilo-q/.gemini/antigravity/scratch/invima-dashboard/rec_gaico.js"
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write("window.REC_GAICO_DATASET = ")
        json.dump(all_studies, f, ensure_ascii=False)
        f.write(";")
    print(f"Saved JS bundle to {js_path}")

if __name__ == '__main__':
    download_rec_gaico()
