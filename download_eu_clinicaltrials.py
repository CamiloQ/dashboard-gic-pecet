import requests
import re
import json
from html import unescape
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE_URL = "https://www.clinicaltrialsregister.eu/ctr-search/search"
HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}

def fetch_eu_page(page_num):
    url = f"{BASE_URL}?query=&page={page_num}"
    try:
        r = requests.get(url, headers=HEADERS, timeout=20)
        if r.status_code != 200:
            return []
        
        html = r.text
        blocks = html.split('<table class="result">')[1:]
        parsed_studies = []

        for b in blocks:
            eudract_match = re.search(r'EudraCT Number:.*?</span>\s*([\d\-]+)', b, re.DOTALL)
            title_match = re.search(r'Full Title:.*?</span>\s*(.*?)\s*<', b, re.DOTALL)
            sponsor_match = re.search(r'Sponsor Name:.*?</span>\s*(.*?)\s*<', b, re.DOTALL)
            cond_match = re.search(r'Medical condition:.*?</span>\s*(.*?)\s*<', b, re.DOTALL)
            date_match = re.search(r'Start Date.*?:.*?</span>\s*([\d\-]+)', b, re.DOTALL)

            eudract = eudract_match.group(1).strip() if eudract_match else ''
            title = unescape(re.sub(r'<[^>]+>', ' ', title_match.group(1))).strip() if title_match else ''
            sponsor = unescape(re.sub(r'<[^>]+>', ' ', sponsor_match.group(1))).strip() if sponsor_match else 'No especificado'
            condition = unescape(re.sub(r'<[^>]+>', ' ', cond_match.group(1))).strip() if cond_match else 'No especificada'
            start_date = date_match.group(1).strip() if date_match else ''

            if eudract or title:
                parsed_studies.append({
                    'radicado': eudract or 'EU-TRIAL',
                    'nct_id': eudract,
                    'titulo': title,
                    'estado_operativo': 'AUTORIZADO EMA',
                    'estado_tabla': 'AUTORIZADO EMA',
                    'fase_tabla': 'UE-Ensayos',
                    'patrocinador_cro': sponsor,
                    'patrocinador_tabla': sponsor,
                    'especialidades': condition,
                    'fecha_radicacion': start_date,
                    'fecha_acto_administrativo': start_date,
                    'palabra_clave': condition,
                    'pais_origen': 'Unión Europea (EMA)',
                    'enlace_registro_primario': f"https://www.clinicaltrialsregister.eu/ctr-search/search?query={eudract}",
                    'full_url': f"https://www.clinicaltrialsregister.eu/ctr-search/search?query={eudract}",
                    'concepto_regulatorio': 'REGISTRADO EMA (EU)',
                    'numero_acto_administrativo': eudract,
                    'acta': f"EudraCT: {eudract}"
                })

        return parsed_studies
    except Exception as e:
        print(f"Error fetching EU page {page_num}: {e}")
        return []

def main():
    print("=== Step 2: Fetching Studies from EU Clinical Trials Register ===")
    all_eu_studies = []
    
    with ThreadPoolExecutor(max_workers=5) as executor:
        futures = {executor.submit(fetch_eu_page, p): p for p in range(1, 26)}
        for future in as_completed(futures):
            p = futures[future]
            res = future.result()
            print(f"EU Page {p}: retrieved {len(res)} studies")
            all_eu_studies.extend(res)

    # De-duplicate
    unique_eu = {}
    for s in all_eu_studies:
        key = s['nct_id'] or s['titulo']
        if key and key not in unique_eu:
            unique_eu[key] = s

    eu_list = list(unique_eu.values())
    print(f"\nTotal unique EU Clinical Trials collected: {len(eu_list)}")

    # Save JSON
    json_path = "/home/camilo-q/.gemini/antigravity/scratch/invima-dashboard/eu_clinicaltrials.json"
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(eu_list, f, ensure_ascii=False, indent=2)
    print(f"Saved JSON to {json_path}")

    # Save JS bundle
    js_path = "/home/camilo-q/.gemini/antigravity/scratch/invima-dashboard/eu_clinicaltrials.js"
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write("window.EU_CLINICALTRIALS_DATASET = ")
        json.dump(eu_list, f, ensure_ascii=False)
        f.write(";")
    print(f"Saved JS bundle to {js_path}")

if __name__ == '__main__':
    main()
