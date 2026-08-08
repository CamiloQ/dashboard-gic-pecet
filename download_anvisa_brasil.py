import subprocess
import os
import json
import pandas as pd
from html import unescape

def process_anvisa_brasil():
    print("=== Step 1: Processing ANVISA Brasil Official Export Dataset ===")
    xls_path = "/home/camilo-q/.gemini/antigravity/scratch/invima-dashboard/anvisa_export.xls"
    
    if not os.path.exists(xls_path) or os.path.getsize(xls_path) < 100000:
        print("Downloading ANVISA official bulk export file...")
        url = "https://consultas.anvisa.gov.br/api/ensaio/download"
        cmd = [
            'curl', '-s',
            '-H', 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            '-H', 'Accept: application/octet-stream, application/vnd.ms-excel, */*',
            '-H', 'Authorization: Guest',
            url, '-o', xls_path
        ]
        subprocess.run(cmd, check=True)
        print(f"Downloaded ANVISA export: {os.path.getsize(xls_path)} bytes")

    # Read Excel header starting at row 4 (0-indexed)
    df = pd.read_excel(xls_path, header=4)
    print(f"Total rows in Excel export: {len(df)}")

    parsed_studies = []
    for idx, row in df.iterrows():
        patrocinador = str(row.get('Patrocinador do Estudo') or '').strip()
        if not patrocinador or patrocinador == 'nan' or patrocinador == 'Patrocinador do Estudo':
            continue

        processo = str(row.get('Número do Processo') or '').strip()
        ddcm = str(row.get('Número do CE / DDCM') or '').strip()
        medicamento = str(row.get('Nome ou Código do Medicamento Experimental') or '').strip()
        classe_terapeutica = str(row.get('Classe Terapêutica') or '').strip()
        tipo_med = str(row.get('Tipo de Medicamento Experimental') or '').strip()
        doenca_cid = str(row.get('Doença / CID10') or '').strip()
        protocolo = str(row.get('Nome do Protocolo Clínico') or '').strip()
        titulo = str(row.get('Título do Estudo') or '').strip()
        fase = str(row.get('Fase do Estudo') or '').strip()
        situacao = str(row.get('Situação do Estudo') or '').strip()
        instituicao = str(row.get('Instituição de Pesquisa/Investigador/Número de Pacientes') or '').strip()
        data_atualizacao = str(row.get('Data de Atualização da base de dados') or '').strip()

        radicado = ddcm if (ddcm and ddcm != 'nan' and ddcm != '-') else (processo if (processo and processo != 'nan') else f"ANVISA-{idx+1}")

        # Clean text
        clean_title = unescape(titulo) if (titulo and titulo != 'nan' and titulo != '-') else (f"Estudo Clínico ANVISA - Produto: {medicamento}" if medicamento and medicamento != 'nan' else "Estudo Clínico ANVISA")
        clean_title = clean_title.replace('&#8805;', '≥').replace('&lt;', '<').replace('&gt;', '>')

        clean_sponsor = patrocinador if (patrocinador and patrocinador != 'nan') else "Patrocinador ANVISA"
        clean_status = situacao if (situacao and situacao != 'nan' and situacao != '-') else "AUTORIZADO"
        
        # Determine specialty
        clean_esp = "Ensaios Clínicos ANVISA"
        if doenca_cid and doenca_cid != 'nan' and doenca_cid != '-':
            clean_esp = unescape(doenca_cid)
        elif classe_terapeutica and classe_terapeutica != 'nan' and classe_terapeutica != '-':
            clean_esp = unescape(classe_terapeutica)

        clean_fase = fase if (fase and fase != 'nan' and fase != '-') else "N/A"

        parsed_studies.append({
            'radicado': radicado,
            'nct_id': radicado,
            'titulo': clean_title,
            'estado_operativo': clean_status,
            'estado_tabla': clean_status,
            'fase_tabla': clean_fase,
            'patrocinador_cro': clean_sponsor,
            'patrocinador_tabla': clean_sponsor,
            'especialidades': clean_esp,
            'fecha_radicacion': data_atualizacao[:10] if data_atualizacao and data_atualizacao != 'nan' else 'ANVISA Brasil',
            'fecha_acto_administrativo': data_atualizacao[:10] if data_atualizacao and data_atualizacao != 'nan' else 'ANVISA Brasil',
            'palabra_clave': f"Produto: {medicamento} | Classe: {classe_terapeutica} | CID10: {doenca_cid}",
            'pais_origen': 'Brasil (ANVISA)',
            'enlace_registro_primario': 'https://consultas.anvisa.gov.br/#/ensaiosclinicos/',
            'full_url': 'https://consultas.anvisa.gov.br/#/ensaiosclinicos/',
            'concepto_regulatorio': f"{clean_status.upper()} ANVISA (BR)",
            'numero_acto_administrativo': processo if (processo and processo != 'nan') else radicado,
            'acta': f"DDCM: {ddcm} | Processo: {processo} | Protocolo: {protocolo}",
            'medicamento': medicamento,
            'classe_terapeutica': classe_terapeutica,
            'doenca_cid': doenca_cid,
            'protocolo': protocolo,
            'instituicao_investigador': instituicao
        })

    print(f"Successfully processed {len(parsed_studies)} rich ANVISA records.")

    # Save JSON
    json_path = "/home/camilo-q/.gemini/antigravity/scratch/invima-dashboard/anvisa_brasil.json"
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(parsed_studies, f, ensure_ascii=False, indent=2)
    print(f"Saved rich JSON to {json_path}")

    # Save JS bundle
    js_path = "/home/camilo-q/.gemini/antigravity/scratch/invima-dashboard/anvisa_brasil.js"
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write("window.ANVISA_BRASIL_DATASET = ")
        json.dump(parsed_studies, f, ensure_ascii=False)
        f.write(";")
    print(f"Saved rich JS bundle to {js_path}")

if __name__ == '__main__':
    process_anvisa_brasil()
