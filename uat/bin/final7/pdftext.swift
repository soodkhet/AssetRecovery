import PDFKit
let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let doc = PDFDocument(url: url) else { print("ERR open"); exit(1) }
for i in 0..<doc.pageCount { print("--- page \(i+1)"); print(doc.page(at: i)?.string ?? "") }
