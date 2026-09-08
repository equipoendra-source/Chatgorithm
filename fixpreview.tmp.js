node - <<'PY'
const fs=require('fs');
const p='client/src/components/CampaignsDashboard.tsx';
let s=fs.readFileSync(p,'utf8');
const old = `function previewWithVariables(body: string, variables: string[]): string {
    return body.replace(/\{\{(\d+)\}\}/g, (_m, idx) => {
        const i = Number(idx) - 1;
        const v = variables[i] || \`{{\${idx}}}\`;
        // Mostrar el placeholder de personalización tal cual
        return v;
    });
}`;
const nue = `function previewWithVariables(body: string, variables: string[]): string {
    // Soporta variables numeradas ({{1}}) y con nombre ({{referencia}}, el
    // formato que obliga la consola de Meta). Para las nombradas no hay índice
    // dentro del placeholder, así que nos guiamos por el ORDEN DE APARICIÓN en
    // el cuerpo — el mismo contrato que usa el servidor al construir los
    // parámetros. Sin esto, la vista previa de una plantilla importada mostraba
    // {{referencia}} en crudo mientras los campos de al lado decían "Variable 1".
    const orden: string[] = [];
    for (const m of body.matchAll(/\{\{([A-Za-z0-9_]+)\}\}/g)) {
        if (!orden.includes(m[1])) orden.push(m[1]);
    }
    return body.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_m, clave) => {
        const i = orden.indexOf(clave);
        return variables[i] || \`{{\${clave}}}\`;
    });
}`;
if(!s.includes(old)){ console.error('NO ENCONTRADO'); process.exit(1); }
fs.writeFileSync(p, s.replace(old,nue));
console.log('previewWithVariables actualizada');
PY
rm -f ./fixpreview.tmp.js
