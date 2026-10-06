// อ่านข้อความ/จำนวนหน้า/ภาพทุกหน้าของ PDF ด้วย PDFKit (เครื่องไม่มี pdftotext)
// swift uat/bin/r14/pdftext.swift <pdf> [pngPrefix]
import PDFKit
import AppKit
let a = CommandLine.arguments
guard let doc = PDFDocument(url: URL(fileURLWithPath: a[1])) else { print("cannot open"); exit(1) }
print("PAGES \(doc.pageCount)")
for i in 0..<doc.pageCount {
  guard let p = doc.page(at: i) else { continue }
  print("=== page \(i + 1)")
  print(p.string ?? "")
  if a.count > 2 {
    let r = p.bounds(for: .mediaBox)
    let img = p.thumbnail(of: NSSize(width: r.width * 2, height: r.height * 2), for: .mediaBox)
    if let t = img.tiffRepresentation, let b = NSBitmapImageRep(data: t), let png = b.representation(using: .png, properties: [:]) {
      try? png.write(to: URL(fileURLWithPath: "\(a[2])-p\(i + 1).png"))
    }
  }
}
