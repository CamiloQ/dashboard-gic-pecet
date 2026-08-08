import json
import re
import os

folder = '/home/camilo-q/.gemini/antigravity/scratch/invima-dashboard'
j_path = os.path.join(folder, 'cofepris_mexico.json')
js_path = os.path.join(folder, 'cofepris_mexico.js')

with open(j_path, 'r', encoding='utf-8') as f:
    data = json.load(f)

# Drug and Condition to Specialty Mapping Rules
ONCOLOGY_MOLECULES = r'(?i)(imatinib|trastuzumab|pembrolizumab|bevacizumab|rituximab|cisplatino|paclitaxel|doxorrubicina|erlotinib|gefitinib|sorafenib|sunitinib|nilotinib|dasatinib|bortezomib|carfilzomib|olaparib|niraparib|lenvatinib|cabozantinib|osimertinib|alectinib|durvalumab|atezolizumab|nivolumab|ipilimumab|abemaciclib|palbociclib|ribociclib|tamoxifeno|letrozol|anastrozol|bicalutamida|enzalutamida|abiraterona|docetaxel|gemcitabina|capecitabina|carboplatino|oxaliplatino|topotecan|irinotecan|etopósido|vinblastina|vincristina|doxorrubicina|epirrubicina|bleomicina|metotrexato|azacitidina|decitabina|venetoclax|rucaparib|sacituzumab|enfortumab|tucatinib|lapatinib|neratinib|dacomitinib|trametinib|dabrafenib|vemurafenib|encorafenib|binimetinib|selumetinib|ceritinib|brigatinib|lorlatinib|capmatinib|tepotinib|pemigatinib|infigratinib|futibatinib|avapritinib|ripretinib|sotorasib|adagrasib|tivozanib|belzutifan|pralsetinib|selpercatinib)'
CARDIO_MOLECULES = r'(?i)(dapagliflozina|empagliflozina|canagliflozina|sacubitril|valsartan|losartan|telmisartan|candesartan|enalapril|ramipril|lisinopril|amlodipino|nifedipino|diltiazem|verapamilo|bisoprolol|metoprolol|carvedilol|nebivolol|atorvastatina|rosuvastatina|simvastatina|ezetimiba|alirocumab|evolocumab|clopidogrel|prasugrel|ticagrelor|apixaban|rivaroxaban|dabigatran|edoxaban|warfarina|furosemida|espironolactona|eplerenona|ivabradina|ranolazina)'
DIABETES_MOLECULES = r'(?i)(insulina|metformina|sitagliptina|vildagliptina|saxagliptina|linagliptina|alogliptina|semaglutida|liraglutida|dulaglutida|exenatida|tirzepatida|glimepirida|glibenclamida|gliclazida|pioglitazona)'
INFECTO_MOLECULES = r'(?i)(eritromicina|azitromicina|claritromicina|amoxicilina|ampicilina|cefatriaxona|ceftriaxona|cefepima|ceftazidima|meropenem|imipenem|vancomicina|linezolid|daptomicina|ciprofloxacino|levofloxacino|moxifloxacino|fluconazol|itraconazol|voriconazol|posaconazol|caspofungina|anidulafungina|micafungina|acrevic|remdesivir|nirmatrelvir|ritonavir|favipiravir|sofosbuvir|velpatasvir|glecaprevir|pibrentasvir|tenofovir|emtricitabina|lamivudina|efavirenz|dolutegravir|bictegravir|raltegravir|oseltamivir)'

def extract_year(text, default_year='2018'):
    if not text:
        return default_year

    # Check for resolution key format e.g. 143300410B0016 -> 2014, 213300410A0012 -> 2021, /A446-17 -> 2017
    m = re.search(r'\b(199\d|20[0-2]\d)\b', text)
    if m:
        return m.group(1)

    m_key = re.search(r'\b([0-2]\d)3300', text)
    if m_key:
        yr = int(m_key.group(1))
        if 0 <= yr <= 26:
            return f"20{yr:02d}"

    m_slash = re.search(r'[-/](1[0-9]|2[0-6])\b', text)
    if m_slash:
        return f"20{int(m_slash.group(1)):02d}"

    return default_year

for item in data:
    full_text = f"{item.get('titulo', '')} {item.get('radicado', '')} {item.get('palabra_clave', '')}"

    # Extract year
    yr = extract_year(full_text)
    item['fecha_radicacion'] = f"{yr}-01-15"
    item['fecha_acto_administrativo'] = f"{yr}-06-30"

    # Specialty refinement
    if re.search(ONCOLOGY_MOLECULES, full_text) or re.search(r'(?i)(cancer|carcinoma|tumor|oncolog|neoplas|leukem|linfom|melanom|sarcom|metast)', full_text):
        item['especialidades'] = 'Oncología'
    elif re.search(CARDIO_MOLECULES, full_text) or re.search(r'(?i)(cardio|heart|infart|coronar|hipertens|arritm|insuficiencia card)', full_text):
        item['especialidades'] = 'Cardiología'
    elif re.search(DIABETES_MOLECULES, full_text) or re.search(r'(?i)(diabet|insul|glicem|glycem|metabol|obesid)', full_text):
        item['especialidades'] = 'Endocrinología y Diabetes'
    elif re.search(INFECTO_MOLECULES, full_text) or re.search(r'(?i)(infect|viral|virus|covid|sars|hiv|vih|hepatit|dengue|malaria|tubercul|vacun)', full_text):
        item['especialidades'] = 'Infectología y Vacunas'
    elif re.search(r'(?i)(pulmon|lung|respirat|asma|asthma|epoc|copd)', full_text):
        item['especialidades'] = 'Neumología'
    elif re.search(r'(?i)(neur|brain|alzheim|parkins|epilep|cerebr|esclerosis)', full_text):
        item['especialidades'] = 'Neurología'
    elif re.search(r'(?i)(gastro|intest|hepato|liver|crohn|colitis)', full_text):
        item['especialidades'] = 'Gastroenterología'
    elif re.search(r'(?i)(reumat|artrit|lupus|arthrit|psorias)', full_text):
        item['especialidades'] = 'Reumatología'
    elif re.search(r'(?i)(hematol|anem|coagul|hemophil|mielo)', full_text):
        item['especialidades'] = 'Hematología'
    elif re.search(r'(?i)(nefro|kidney|renal|dialys)', full_text):
        item['especialidades'] = 'Nefrología'
    elif re.search(r'(?i)(dermat|piel|skin|eczema)', full_text):
        item['especialidades'] = 'Dermatología'
    elif re.search(r'(?i)(pediatr|niño|infant)', full_text):
        item['especialidades'] = 'Pediatría'
    elif re.search(r'(?i)(ginec|uterin|ovari|cervic)', full_text):
        item['especialidades'] = 'Ginecología y Obstetricia'
    else:
        item['especialidades'] = 'Medicina General y Otras Especialidades'

# Sort dataset by date descending so recent studies (2024, 2023, 2022...) appear at the top!
data.sort(key=lambda x: x.get('fecha_radicacion', ''), reverse=True)

print(f"Updated and sorted {len(data)} COFEPRIS Mexico records!")

# Count years distribution
year_counts = {}
for x in data:
    y = x['fecha_radicacion'][:4]
    year_counts[y] = year_counts.get(y, 0) + 1

print("COFEPRIS Studies Distribution by Year (Top 10):")
for y in sorted(year_counts.keys(), reverse=True)[:10]:
    print(f"  {y}: {year_counts[y]} studies")

# Count specialty distribution
spec_counts = {}
for x in data:
    s = x['especialidades']
    spec_counts[s] = spec_counts.get(s, 0) + 1

print("\nCOFEPRIS Studies Distribution by Specialty:")
for s, c in sorted(spec_counts.items(), key=lambda t: t[1], reverse=True):
    print(f"  {s}: {c} studies")

# Save JSON and JS
with open(j_path, 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

with open(js_path, 'w', encoding='utf-8') as f:
    f.write("window.COFEPRIS_MEXICO_DATASET = ")
    json.dump(data, f, ensure_ascii=False)
    f.write(";")

print("Saved updated cofepris_mexico.json and cofepris_mexico.js!")
