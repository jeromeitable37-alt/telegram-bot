
const restrictedNamePatterns=[
  /net\s*cut(?:ter)?/i,
  /disable[\s._-]*(?:thermal|anti[\s._-]*crack|security|verification|integrity)/i,
  /thermal[\s._-]*(?:override|disable|bypass|off)/i,
  /\b(?:spoof|spoofer|spoofing)[\s._-]*(?:device|id|root|fps|model)?\b/i,
  /\b(?:ghostlock|dfroot)\b/i,
  /\b(?:cracked|pirated|premium\s*mod|pro\s*lifetime)\b/i
];
export function restrictedFileName(file={}){
  const name=String(file.file_name||file.display_name||'').slice(0,250);
  return restrictedNamePatterns.some(pattern=>pattern.test(name));
}
export function publicFileAllowed(file={}){
  return file.review_status==='approved' && restrictedFileName(file)===false;
}
