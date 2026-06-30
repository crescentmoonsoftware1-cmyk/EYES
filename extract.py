import sys
from pypdf import PdfReader

reader = PdfReader('e:\\Projects\\The EYES\\img\\EYES_Seeded_Pattern_Library_v0.pdf')
text = '\n'.join([page.extract_text() for page in reader.pages if page.extract_text()])

with open('e:\\Projects\\The EYES\\img\\EYES_Seeded_Pattern_Library_v0_text.txt', 'w', encoding='utf-8') as f:
    f.write(text)
print("Extracted.")
