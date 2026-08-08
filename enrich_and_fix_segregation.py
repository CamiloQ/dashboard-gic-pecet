import json
import re
import os

folder = '/home/camilo-q/.gemini/antigravity/scratch/invima-dashboard'

# Keyword mapping rules for Medical Specialties
SPECIALTY_RULES = [
    (r'(?i)(cancer|carcinoma|tumor|oncolog|neoplas|leukem|linfom|melanom|sarcom|metast)', 'Oncología'),
    (r'(?i)(cardio|heart|infart|coronar|hipertens|arritm|insuficiencia card|insuficiência card)', 'Cardiología'),
    (r'(?i)(diabet|insul|glicem|glycem|metabol|obesid)', 'Endocrinología y Diabetes'),
    (r'(?i)(pulmon|lung|respirat|asma|asthma|epoc|copd|bronq)', 'Neumología'),
    (r'(?i)(neur|brain|alzheim|parkins|epilep|cerebr|esclerosis|headache)', 'Neurología'),
    (r'(?i)(infect|viral|virus|covid|sars|hiv|vih|hepatit|dengue|malaria|tubercul|vacun|vaccin|bacteri|funga)', 'Infectología y Vacunas'),
    (r'(?i)(gastro|intest|hepato|liver|crohn|colitis|gastric|colon)', 'Gastroenterología'),
    (r'(?i)(reumat|artrit|lupus|arthrit|psorias)', 'Reumatología'),
    (r'(?i)(hematol|anem|coagul|hemophil|mielo)', 'Hematología'),
    (r'(?i)(nefro|kidney|renal|dialys|urinari)', 'Nefrología'),
    (r'(?i)(dermat|piel|skin|eczema|atop)', 'Dermatología'),
    (r'(?i)(pediatr|niño|infant|children)', 'Pediatría'),
    (r'(?i)(oftalm|eye|ocular|glaucom|macul)', 'Oftalmología'),
    (r'(?i)(ginec|uterin|ovari|cervic|embaraz|matern)', 'Ginecología y Obstetricia'),
    (r'(?i)(psiquiatr|depres|ansiedad|schizophr|bipolar)', 'Psiquiatría y Salud Mental'),
    (r'(?i)(surg|cirug|postoperat|trauma)', 'Cirugía General')
]

SPONSOR_RULES = [
    (r'(?i)astrazeneca', 'AstraZeneca'),
    (r'(?i)(novartis|sandoz)', 'Novartis'),
    (r'(?i)pfizer', 'Pfizer'),
    (r'(?i)(merck|msd|keytruda)', 'Merck Sharp & Dohme (MSD)'),
    (r'(?i)(roche|genentech)', 'Hoffmann-La Roche'),
    (r'(?i)(lilly|eli lilly)', 'Eli Lilly and Company'),
    (r'(?i)(sanofi|aventis)', 'Sanofi'),
    (r'(?i)(bayer)', 'Bayer'),
    (r'(?i)(boehringer)', 'Boehringer Ingelheim'),
    (r'(?i)(jansen|johnson|j&j)', 'Janssen / Johnson & Johnson'),
    (r'(?i)(bristol|bms)', 'Bristol Myers Squibb'),
    (r'(?i)(abbvie|abbott)', 'AbbVie'),
    (r'(?i)(takeda)', 'Takeda'),
    (r'(?i)(amgen)', 'Amgen'),
    (r'(?i)(gilead)', 'Gilead Sciences'),
    (r'(?i)(iqvia|quintiles)', 'IQVIA / Quintiles'),
    (r'(?i)(ppd)', 'PPD Development'),
    (r'(?i)(parexel)', 'Parexel International'),
    (r'(?i)(icon)', 'ICON Clinical Research'),
    (r'(?i)(covance|labcorp)', 'Labcorp / Covance'),
    (r'(?i)(syneos)', 'Syneos Health'),
    (r'(?i)(medpace)', 'Medpace'),
    (r'(?i)(dps|servier)', 'Servier'),
    (r'(?i)(fiocruz)', 'Fundación Oswaldo Cruz (Fiocruz)'),
    (r'(?i)(universid|university|hospital|inst)', 'Institución Académica / Hospitalaria')
]

PHASE_RULES = [
    (r'(?i)(fase\s*4|phase\s*4|fase\s*iv|phase\s*iv)', 'Fase 4'),
    (r'(?i)(fase\s*3|phase\s*3|fase\s*iii|phase\s*iii)', 'Fase 3'),
    (r'(?i)(fase\s*2|phase\s*2|fase\s*ii|phase\s*ii)', 'Fase 2'),
    (r'(?i)(fase\s*1|phase\s*1|fase\s*i|phase\s*i)', 'Fase 1'),
]

STATUS_RULES = [
    (r'(?i)(recruiting|reclutando|abierto|iniciado|activo|vigente)', 'RECLUTANDO / ACTIVO'),
    (r'(?i)(completed|completado|cerrado|terminado|finalizado)', 'COMPLETADO / CERRADO'),
    (r'(?i)(suspended|suspendido|cancelado|retirado|withdrawn|terminated)', 'SUSPENDIDO / CANCELADO'),
    (r'(?i)(autorizado|aprobado|registrado|not recruiting)', 'AUTORIZADO / REGISTRADO')
]

def classify_text(text, rules, default_val):
    if not text:
        return default_val
    for pattern, val in rules:
        if re.search(pattern, text):
            return val
    return default_val

def process_file(json_name, js_name, global_var):
    j_path = os.path.join(folder, json_name)
    js_path = os.path.join(folder, js_name)

    if not os.path.exists(j_path):
        print(f"Skipping {json_name}, not found.")
        return

    with open(j_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    updated_count = 0
    for item in data:
        full_text = f"{item.get('titulo', '')} {item.get('especialidades', '')} {item.get('palabra_clave', '')} {item.get('acta', '')}"
        sponsor_text = f"{item.get('patrocinador_cro', '')} {item.get('palabra_clave', '')}"
        phase_text = f"{item.get('fase_tabla', '')} {item.get('titulo', '')}"
        status_text = f"{item.get('estado_operativo', '')} {item.get('estado_tabla', '')}"

        # 1. Refine Specialty
        curr_spec = item.get('especialidades', '')
        if not curr_spec or any(k in curr_spec for k in ['COFEPRIS', 'Américas', 'REC GAICO', 'Ensayos Clínicos']) or len(curr_spec) > 80:
            new_spec = classify_text(full_text, SPECIALTY_RULES, 'Medicina General y Otras Especialidades')
            item['especialidades'] = new_spec
        else:
            # Clean suffixes
            item['especialidades'] = re.sub(r'\s*\((REC GAICO|COFEPRIS|OPS|PAHO)\)', '', curr_spec).strip()

        # 2. Refine Sponsor
        curr_spon = item.get('patrocinador_cro', '')
        if not curr_spon or any(k in curr_spon for k in ['COFEPRIS', 'Red OPS/PAHO', 'REC GAICO Argentina']) or curr_spon.startswith('Patrocinador'):
            new_spon = classify_text(sponsor_text, SPONSOR_RULES, 'Patrocinador Independiente / Industria Farmacéutica')
            item['patrocinador_cro'] = new_spon
            item['patrocinador_tabla'] = new_spon
        else:
            clean_spon = re.sub(r'\s*\((REC GAICO Argentina|Colombia|México|Brasil)\)', '', curr_spon).strip()
            item['patrocinador_cro'] = clean_spon
            item['patrocinador_tabla'] = clean_spon

        # 3. Refine Phase
        curr_phase = item.get('fase_tabla', '')
        if not curr_phase or curr_phase in ['N/A', '-', 'UE-Ensayos']:
            new_phase = classify_text(phase_text, PHASE_RULES, 'Fase 3')
            item['fase_tabla'] = new_phase

        # 4. Refine Status
        curr_status = item.get('estado_operativo', '')
        new_status = classify_text(status_text, STATUS_RULES, 'AUTORIZADO / REGISTRADO')
        item['estado_operativo'] = new_status
        item['estado_tabla'] = new_status

        updated_count += 1

    # Save JSON
    with open(j_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # Save JS
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write(f"window.{global_var} = ")
        json.dump(data, f, ensure_ascii=False)
        f.write(";")

    # Print summary
    specs = set(x['especialidades'] for x in data)
    spons = set(x['patrocinador_cro'] for x in data)
    stats = set(x['estado_operativo'] for x in data)
    phases = set(x['fase_tabla'] for x in data)

    print(f"[{json_name}] Updated {updated_count} records cleanly!")
    print(f"  -> Specialties ({len(specs)}): {list(specs)[:4]}")
    print(f"  -> Sponsors ({len(spons)}): {list(spons)[:4]}")
    print(f"  -> Statuses ({len(stats)}): {list(stats)[:4]}")
    print(f"  -> Phases ({len(phases)}): {list(phases)[:4]}")

if __name__ == '__main__':
    process_file('cofepris_mexico.json', 'cofepris_mexico.js', 'COFEPRIS_MEXICO_DATASET')
    process_file('paho_americas.json', 'paho_americas.js', 'PAHO_AMERICAS_DATASET')
    process_file('rec_gaico.json', 'rec_gaico.js', 'REC_GAICO_DATASET')
    process_file('eu_clinicaltrials.json', 'eu_clinicaltrials.js', 'EU_CLINICALTRIALS_DATASET')
    process_file('anvisa_brasil.json', 'anvisa_brasil.js', 'ANVISA_BRASIL_DATASET')
    process_file('clinicaltrials_gov.json', 'clinicaltrials_gov.js', 'CLINICALTRIALS_GOV_DATASET')
    process_file('invima_estudios_clinicos.json', 'dataset.js', 'INVIMA_DATASET')
