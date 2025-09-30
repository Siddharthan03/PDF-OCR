import fitz  # PyMuPDF
from PIL import Image
import io
import matplotlib.pyplot as plt

doc = fitz.open("/Users/siddharthan/Desktop/GetMax/PDF-OCR/backend/05072025 SHARRON SCHUMANN PPA copy.pdf")
page = doc[2]
page_height = page.rect.height

# Move the box about 1 inch (72 points) upward
top_y = page_height * 0.78 - 30
bottom_y = page_height * 0.92 - 30
rect = fitz.Rect(30, top_y, 580, bottom_y)

pix = page.get_pixmap(dpi=300, clip=rect)
img = Image.open(io.BytesIO(pix.tobytes("png")))

plt.figure(figsize=(10, 6))
plt.imshow(img)
plt.axis("off")
plt.title("Moved Secondary Insurance Block (1 inch up)")
plt.show()
