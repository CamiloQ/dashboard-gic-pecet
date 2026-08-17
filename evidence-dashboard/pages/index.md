# GIC-PECET • Portal Multirregistro de Ensayos Clínicos

```sql ct_summary
select count(*) as total_ct from multiregistry.clinicaltrials
```

```sql oms_summary
select count(*) as total_oms from multiregistry.oms
```

```sql invima_summary
select count(*) as total_invima from multiregistry.invima
```

```sql anvisa_summary
select count(*) as total_anvisa from multiregistry.anvisa
```

```sql cofepris_summary
select count(*) as total_cofepris from multiregistry.cofepris
```

```sql anmat_summary
select count(*) as total_anmat from multiregistry.anmat
```

## Cobertura Global de Registros Multirregionales

<Grid cols=4>
  <BigValue data={ct_summary} value=total_ct title="ClinicalTrials.gov (Global)" fmt=num0 />
  <BigValue data={oms_summary} value=total_oms title="OMS Global ICTRP" fmt=num0 />
  <BigValue data={invima_summary} value=total_invima title="INVIMA Colombia" fmt=num0 />
  <BigValue data={anvisa_summary} value=total_anvisa title="ANVISA Brasil" fmt=num0 />
</Grid>

<Grid cols=4>
  <BigValue data={cofepris_summary} value=total_cofepris title="COFEPRIS México" fmt=num0 />
  <BigValue data={anmat_summary} value=total_anmat title="ANMAT Argentina" fmt=num0 />
</Grid>

---

## 1. ClinicalTrials.gov (EEUU & Global) • 463.287 Registros

```sql ct_phases
select fase_tabla as fase, count(*) as cantidad
from multiregistry.clinicaltrials
group by 1 order by cantidad desc limit 8
```

```sql ct_sample
select nct_id, titulo, patrocinador_cro, fase_tabla, estado_operativo
from multiregistry.clinicaltrials
limit 100
```

<BarChart data={ct_phases} x=fase y=cantidad title="Distribución de Ensayos Clínicos por Fase (NIH)" />
<DataTable data={ct_sample} search=true pagination=true />

---

## 2. OMS Global ICTRP • 349.479 Registros

```sql oms_sample
select radicado, titulo, patrocinador_cro, fase_tabla, estado_operativo
from multiregistry.oms
limit 100
```

<DataTable data={oms_sample} search=true pagination=true />

---

## 3. INVIMA Colombia • 1.150 Registros

```sql invima_sponsors
select patrocinador_cro, count(*) as total
from multiregistry.invima
group by 1 order by total desc limit 10
```

```sql invima_data
select radicado, titulo, patrocinador_cro, estado_operativo
from multiregistry.invima
```

<BarChart data={invima_sponsors} x=patrocinador_cro y=total title="Top 10 Patrocinadores / CROs en Colombia" swapXY=true />
<DataTable data={invima_data} search=true pagination=true />

---

## 4. ANVISA Brasil • 4.669 Registros

```sql anvisa_data
select radicado, titulo, patrocinador_cro, estado_operativo
from multiregistry.anvisa
limit 100
```

<DataTable data={anvisa_data} search=true pagination=true />

---

## 5. COFEPRIS México • 5.568 Registros

```sql cofepris_data
select radicado, titulo, patrocinador_cro, estado_operativo
from multiregistry.cofepris
limit 100
```

<DataTable data={cofepris_data} search=true pagination=true />

---

## 6. ANMAT Argentina • 1.862 Registros

```sql anmat_data
select radicado, titulo, patrocinador_cro, estado_operativo
from multiregistry.anmat
```

<DataTable data={anmat_data} search=true pagination=true />
