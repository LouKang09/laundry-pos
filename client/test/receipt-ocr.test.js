import {test,expect} from "vitest";
import {extractPaymentReference} from "../src/receipt-ocr";

const cases=[
  ["GCASH","MAYA","GCash payment successful\nRef. No.: 1234 5678 9012","123456789012"],
  ["GCASH","MAYA","Amount: 225.00\nMobile number 09123456789\nReference Number\n34256789012","34256789012"],
  ["OTHERS","MAYA","Reference ID\n888D EB7E 6992","888DEB7E6992"],
  ["OTHERS","MARIBANK","Transaction Reference Number: MARI12345678","MARI12345678"],
  ["OTHERS","GOTYME","Transfer Reference No. GT123456789","GT123456789"],
  ["OTHERS","BPI","Trace ID: BPI23456788","BPI23456788"],
];
test.each(cases)("receipt OCR parser extracts a labelled %s / %s reference", (method,provider,text,expected)=>{
  expect(extractPaymentReference(text,method,provider)).toBe(expected);
});
test("receipt OCR will not guess unlabelled phone numbers or payment amounts",()=>{
  expect(extractPaymentReference("Payment successful\nAmount 200.00\nTo mobile 09123456789","GCASH")).toBe("");
  expect(extractPaymentReference("Reference Number\n09123456789\nAmount 200.00","GCASH")).toBe("");
});
