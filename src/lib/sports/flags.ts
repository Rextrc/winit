/**
 * National-team names as the odds provider spells them → flag codes. The
 * SVGs live in /public/flags (from flag-icons, MIT). Clubs aren't here;
 * they get a generated crest instead.
 */
const COUNTRIES: Record<string, string> = {
  Albania: "al", Algeria: "dz", Andorra: "ad", Argentina: "ar", Armenia: "am", Australia: "au", Austria: "at",
  Azerbaijan: "az", Belarus: "by", Belgium: "be", Bolivia: "bo", "Bosnia and Herzegovina": "ba",
  "Bosnia & Herzegovina": "ba", Brazil: "br", Bulgaria: "bg", Cameroon: "cm", Canada: "ca", Chile: "cl",
  China: "cn", Colombia: "co", "Costa Rica": "cr", Croatia: "hr", Cyprus: "cy", "Czech Republic": "cz",
  Czechia: "cz", Denmark: "dk", Ecuador: "ec", Egypt: "eg", England: "gb-eng", Estonia: "ee",
  "Faroe Islands": "fo", Finland: "fi", France: "fr", Georgia: "ge", Germany: "de", Ghana: "gh",
  Gibraltar: "gi", Greece: "gr", Honduras: "hn", Hungary: "hu", Iceland: "is", India: "in", Indonesia: "id",
  Iran: "ir", Iraq: "iq", Ireland: "ie", "Republic of Ireland": "ie", Israel: "il", Italy: "it",
  "Ivory Coast": "ci", "Cote d'Ivoire": "ci", Jamaica: "jm", Japan: "jp", Jordan: "jo", Kazakhstan: "kz",
  Kosovo: "xk", Latvia: "lv", Liechtenstein: "li", Lithuania: "lt", Luxembourg: "lu", Malaysia: "my",
  Malta: "mt", Mexico: "mx", Moldova: "md", Montenegro: "me", Morocco: "ma", Netherlands: "nl",
  "New Zealand": "nz", Nigeria: "ng", "North Macedonia": "mk", "Northern Ireland": "gb-nir", Norway: "no",
  Panama: "pa", Paraguay: "py", Peru: "pe", Philippines: "ph", Poland: "pl", Portugal: "pt", Qatar: "qa",
  Romania: "ro", Russia: "ru", "San Marino": "sm", "Saudi Arabia": "sa", Scotland: "gb-sct", Senegal: "sn",
  Serbia: "rs", Singapore: "sg", Slovakia: "sk", Slovenia: "si", "South Africa": "za", "South Korea": "kr",
  "Korea Republic": "kr", Spain: "es", Sweden: "se", Switzerland: "ch", Thailand: "th", Tunisia: "tn",
  Turkey: "tr", Turkiye: "tr", Türkiye: "tr", Ukraine: "ua", "United Arab Emirates": "ae", UAE: "ae",
  "United States": "us", USA: "us", Uruguay: "uy", Uzbekistan: "uz", Venezuela: "ve", Vietnam: "vn",
  Wales: "gb-wls",
};

export function flagCode(team: string): string | null {
  return COUNTRIES[team.replace(/\s+(U21|U23|U19|Women|W)$/i, "")] ?? null;
}

export function flagUrl(code: string): string {
  return `/flags/${code}.svg`;
}
