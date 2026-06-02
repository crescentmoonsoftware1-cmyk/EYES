const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

async function main() {
  try {
    const pdfBuffer = fs.readFileSync('../EYES_Handover_Specification (1).pdf');
    const pdfData = await pdfParse(pdfBuffer);
    console.log("=== PDF Content ===");
    console.log(pdfData.text);
  } catch (e) {
    console.log("PDF Error:", e.message);
  }

  try {
    const docxResult = await mammoth.extractRawText({ path: '../EYES_V1_Real_Spec.docx' });
    console.log("\n=== DOCX Content ===");
    console.log(docxResult.value);
  } catch (e) {
    console.log("DOCX Error:", e.message);
  }
}

main();
