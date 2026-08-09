import requests
import json
import time

def fetch_clinicaltrials_gov(max_records=500000):
    print("=== Step 1: Fetching Studies from ClinicalTrials.gov API v2 ===")
    base_url = "https://clinicaltrials.gov/api/v2/studies"
    page_token = None
    all_studies = []
    
    headers = {'User-Agent': 'Mozilla/5.0'}
    
    # query.cond = Pain OR Tropical Medicine OR Infectious Diseases OR Internal Medicine OR Dermatology OR Neurology OR Pediatric Neurology OR Nutrition OR Psychology OR Allergy
    condition_query = "Pain OR Tropical Medicine OR Infectious Diseases OR Internal Medicine OR Dermatology OR Neurology OR Pediatric Neurology OR Nutrition OR Psychology OR Allergy"

    while len(all_studies) < max_records:
        params = {
            'pageSize': 1000,
            'format': 'json',
            'query.cond': condition_query
        }
        if page_token:
            params['pageToken'] = page_token

        try:
            r = requests.get(base_url, params=params, headers=headers, timeout=20)
            if r.status_code != 200:
                print(f"Error HTTP {r.status_code}")
                break
            
            data = r.json()
            studies_batch = data.get('studies', [])
            if not studies_batch:
                break
            
            for s in studies_batch:
                protocol = s.get('protocolSection', {})
                identification = protocol.get('identificationModule', {})
                status_mod = protocol.get('statusModule', {})
                design_mod = protocol.get('designModule', {})
                sponsor_mod = protocol.get('sponsorCollaboratorsModule', {})
                conditions_mod = protocol.get('conditionsModule', {})
                contacts_mod = protocol.get('eligibilityModule', {})
                locations_mod = protocol.get('contactsLocationsModule', {})

                nct_id = identification.get('nctId', '')
                brief_title = identification.get('briefTitle') or identification.get('officialTitle', '')
                official_title = identification.get('officialTitle', brief_title)
                
                overall_status = status_mod.get('overallStatus', 'UNKNOWN')
                start_date = status_mod.get('startDateStruct', {}).get('date', '')
                completion_date = status_mod.get('completionDateStruct', {}).get('date', '')

                phases = design_mod.get('phases', ['N/A'])
                phase_str = ', '.join(phases) if isinstance(phases, list) else str(phases)

                lead_sponsor = sponsor_mod.get('leadSponsor', {}).get('name', 'No especificado')
                conditions = conditions_mod.get('conditions', [])
                condition_str = ', '.join(conditions) if conditions else 'No especificada'

                # Extract locations / countries
                locations = locations_mod.get('locations', [])
                countries = list(set(loc.get('country', '') for loc in locations if loc.get('country')))
                country_str = ', '.join(countries[:5]) if countries else 'Global'

                all_studies.append({
                    'radicado': nct_id,
                    'nct_id': nct_id,
                    'titulo': brief_title,
                    'titulo_oficial': official_title,
                    'estado_operativo': overall_status,
                    'estado_tabla': overall_status,
                    'fase_tabla': phase_str,
                    'patrocinador_cro': lead_sponsor,
                    'patrocinador_tabla': lead_sponsor,
                    'especialidades': condition_str,
                    'fecha_radicacion': start_date,
                    'fecha_acto_administrativo': completion_date,
                    'palabra_clave': condition_str,
                    'pais_origen': country_str,
                    'enlace_registro_primario': f"https://clinicaltrials.gov/study/{nct_id}",
                    'full_url': f"https://clinicaltrials.gov/study/{nct_id}",
                    'concepto_regulatorio': 'REGISTRADO NIH/NLM',
                    'numero_acto_administrativo': nct_id,
                    'acta': f"Identificador NCT: {nct_id}"
                })

            print(f"Retrieved {len(all_studies)} / {max_records} studies...")
            page_token = data.get('nextPageToken')
            if not page_token:
                break
            time.sleep(0.2)

        except Exception as e:
            print(f"Exception during fetch: {e}")
            break

    print(f"\nTotal ClinicalTrials.gov studies collected: {len(all_studies)}")

    # Save JSON
    json_path = "clinicaltrials_gov.json"
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(all_studies, f, ensure_ascii=False, indent=2)
    print(f"Saved JSON to {json_path}")

    # Save JS bundle
    js_path = "clinicaltrials_gov.js"
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write("window.CLINICALTRIALS_GOV_DATASET = ")
        json.dump(all_studies, f, ensure_ascii=False)
        f.write(";")
    print(f"Saved JS bundle to {js_path}")

if __name__ == '__main__':
    fetch_clinicaltrials_gov()
