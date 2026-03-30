require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const Airtable = require('airtable');
require('dotenv').config(); 

const app = express();
const PORT = process.env.PORT || 3000;

// Verificación de seguridad al iniciar
if (!process.env.AIRTABLE_API_KEY || !process.env.AIRTABLE_BASE_ID) {
  console.error("CRITICAL ERROR: Faltan las variables de entorno de Airtable.");
}

const base = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(process.env.AIRTABLE_BASE_ID);
const TABLE_NAME = 'Templates';

app.use(cors()); 
app.use(bodyParser.json());

// --- RUTA DE PRUEBA (Para ver si el servidor responde) ---
app.get('/api/health', (req, res) => {
  res.send('Servidor funcionando correctamente');
});

// --- RUTA 1: OBTENER PLANTILLAS (GET) ---
app.get('/api/templates', async (req, res) => {
  console.log("Intentando obtener plantillas de Airtable...");
  try {
    // HE QUITADO EL SORT "Created" PARA EVITAR ERRORES SI NO EXISTE LA COLUMNA
    const records = await base(TABLE_NAME).select().all();

    console.log(`Éxito: Se encontraron ${records.length} plantillas.`);

    const formattedTemplates = records.map(record => ({
      id: record.id,
      name: record.get('Name') || '',
      category: record.get('Category') || 'MARKETING',
      language: record.get('Language') || 'es',
      body: record.get('Body') || '',
      footer: record.get('Footer') || '',
      status: record.get('Status') || 'PENDING',
      metaId: record.get('MetaId'),
      variableMapping: record.get('VariableMapping') ? JSON.parse(record.get('VariableMapping')) : {}
    }));

    res.json(formattedTemplates);
  } catch (error) {
    console.error("ERROR GRAVE AIRTABLE:", error); // Esto saldrá en los logs de Render
    res.status(500).json({ 
      error: "Error interno al conectar con Airtable", 
      details: error.message 
    });
  }
});

// --- RUTA 2: CREAR PLANTILLA (POST) ---
app.post('/api/create-template', async (req, res) => {
  console.log("Recibida petición para crear plantilla:", req.body.name);
  try {
    const { name, category, body, language, footer, variableExamples } = req.body;
    const simuladoMetaId = "meta_" + Date.now();

    const createdRecords = await base(TABLE_NAME).create([
      {
        "fields": {
          "Name": name,
          "Category": category,
          "Language": language,
          "Body": body,
          "Footer": footer,
          "Status": "PENDING",
          "MetaId": simuladoMetaId,
          "VariableMapping": JSON.stringify(variableExamples || {})
        }
      }
    ]);

    const record = createdRecords[0];
    console.log("Plantilla creada en Airtable con ID:", record.id);

    res.json({
      success: true,
      template: {
        id: record.id,
        name: record.get('Name'),
        category: record.get('Category'),
        language: record.get('Language'),
        body: record.get('Body'),
        footer: record.get('Footer'),
        status: record.get('Status'),
        variableMapping: variableExamples
      }
    });

  } catch (error) {
    console.error("ERROR AL CREAR EN AIRTABLE:", error);
    res.status(400).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor Airtable corriendo en el puerto ${PORT}`);
});
