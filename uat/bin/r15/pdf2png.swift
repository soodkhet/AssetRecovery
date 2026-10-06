// ใช้: swift uat/bin/r15/pdf2png.swift <pdf> <outPrefix> [--text]
import PDFKit
import AppKit
let a = CommandLine.arguments
let doc = PDFDocument(url: URL(fileURLWithPath: a[1]))!
let pref = a[2]
if a.count > 3 && a[3] == "--text" { print(doc.string ?? ""); exit(0) }
for i in 0..<doc.pageCount {
  let p = doc.page(at: i)!
  let r = p.bounds(for: .mediaBox)
  let s: CGFloat = 1.6
  let img = NSImage(size: NSSize(width: r.width*s, height: r.height*s))
  img.lockFocus()
  let ctx = NSGraphicsContext.current!.cgContext
  ctx.setFillColor(NSColor.white.cgColor); ctx.fill(CGRect(x:0,y:0,width:r.width*s,height:r.height*s))
  ctx.scaleBy(x: s, y: s)
  p.draw(with: .mediaBox, to: ctx)
  img.unlockFocus()
  let rep = NSBitmapImageRep(data: img.tiffRepresentation!)!
  try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: "\(pref)-p\(i+1).png"))
}
print("pages \(doc.pageCount)")
