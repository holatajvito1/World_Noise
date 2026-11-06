/* Builds regions.json: the real first-level regions (states, provinces, ...) of every country,
 * plus English names and common spellings/cities used to match Radio Browser's free-text "state" field.
 *
 *   npm install && npm run build:regions
 *
 * Base data: country-region-data (ISO 3166-2 based). Corrections and aliases below. */
"use strict";
const fs = require("fs");
const path = require("path");
const data = require("country-region-data/data.json");

// Countries whose list in the base data isn't the top-level regions → replace entirely.
// Format: [display name, code, [aliases...]]
const REPLACE = {
  GB: [
    ["England", "ENG", ["London", "Greater London", "Manchester", "Greater Manchester", "Birmingham", "West Midlands", "Liverpool", "Merseyside", "Leeds", "Sheffield", "Yorkshire", "West Yorkshire", "South Yorkshire", "North Yorkshire", "East Yorkshire", "Bristol", "Newcastle", "Tyne and Wear", "Nottingham", "Leicester", "Brighton", "Southampton", "Portsmouth", "Kent", "Essex", "Surrey", "Sussex", "East Sussex", "West Sussex", "Hampshire", "Devon", "Cornwall", "Norfolk", "Suffolk", "Cambridge", "Cambridgeshire", "Oxford", "Oxfordshire", "Lancashire", "Cumbria", "Lincolnshire", "Derbyshire", "Staffordshire", "Somerset", "Dorset", "Wiltshire", "Gloucestershire", "Berkshire", "Hertfordshire", "Bedfordshire", "Buckinghamshire", "Northamptonshire", "Warwickshire", "Worcestershire", "Shropshire", "Cheshire", "Durham", "Northumberland", "Isle of Wight", "Coventry", "Plymouth", "Reading", "Milton Keynes"]],
    ["Scotland", "SCT", ["Glasgow", "Edinburgh", "Aberdeen", "Aberdeenshire", "Dundee", "Inverness", "Highlands", "Highland", "Fife", "Lothian", "Ayrshire", "Lanarkshire", "Stirling", "Perth", "Borders", "Dumfries and Galloway", "Shetland", "Orkney", "Western Isles"]],
    ["Wales", "WLS", ["Cardiff", "Swansea", "Newport", "Wrexham", "Gwynedd", "Powys", "Ceredigion", "Pembrokeshire", "Carmarthenshire", "Anglesey", "Cymru"]],
    ["Northern Ireland", "NIR", ["Belfast", "Derry", "Londonderry", "Antrim", "Armagh", "Down", "Fermanagh", "Tyrone", "NI"]],
  ],
  ES: [
    ["Andalusia", "AN", ["Andalucía", "Andalucia", "Almería", "Cádiz", "Córdoba", "Granada", "Huelva", "Jaén", "Málaga", "Sevilla", "Seville", "Marbella"]],
    ["Aragon", "AR", ["Aragón", "Huesca", "Teruel", "Zaragoza"]],
    ["Asturias", "AS", ["Principado de Asturias", "Oviedo", "Gijón"]],
    ["Balearic Islands", "IB", ["Illes Balears", "Islas Baleares", "Baleares", "Mallorca", "Majorca", "Ibiza", "Eivissa", "Menorca", "Palma"]],
    ["Basque Country", "PV", ["País Vasco", "Euskadi", "Araba", "Álava", "Araba/Álava", "Bizkaia", "Vizcaya", "Gipuzkoa", "Guipúzcoa", "Bilbao", "San Sebastián", "Donostia", "Vitoria"]],
    ["Canary Islands", "CN", ["Canarias", "Islas Canarias", "Las Palmas", "Santa Cruz de Tenerife", "Tenerife", "Gran Canaria", "Lanzarote", "Fuerteventura"]],
    ["Cantabria", "CB", ["Santander"]],
    ["Castile and León", "CL", ["Castilla y León", "Ávila", "Burgos", "León", "Palencia", "Salamanca", "Segovia", "Soria", "Valladolid", "Zamora"]],
    ["Castilla–La Mancha", "CM", ["Castilla-La Mancha", "Castilla La Mancha", "Albacete", "Ciudad Real", "Cuenca", "Guadalajara", "Toledo"]],
    ["Catalonia", "CT", ["Catalunya", "Cataluña", "Barcelona", "Girona", "Gerona", "Lleida", "Lérida", "Tarragona"]],
    ["Extremadura", "EX", ["Badajoz", "Cáceres", "Mérida"]],
    ["Galicia", "GA", ["A Coruña", "La Coruña", "Lugo", "Ourense", "Orense", "Pontevedra", "Vigo", "Santiago de Compostela"]],
    ["La Rioja", "RI", ["Rioja", "Logroño"]],
    ["Madrid", "MD", ["Comunidad de Madrid", "Community of Madrid"]],
    ["Murcia", "MC", ["Región de Murcia", "Region of Murcia", "Cartagena"]],
    ["Navarre", "NC", ["Navarra", "Nafarroa", "Navarra/Nafarroa", "Pamplona"]],
    ["Valencia", "VC", ["Comunitat Valenciana", "Comunidad Valenciana", "Valencian Community", "València", "Alicante", "Alacant", "Castellón", "Castelló", "Castellón/Castelló", "Benidorm", "Elche"]],
    ["Ceuta", "CE", []],
    ["Melilla", "ML", []],
  ],
};

// Entries in the base data that aren't regions of that country
const DROP = {
  US: ["Armed Forces Americas", "Armed Forces Europe, Canada, Africa and Middle East", "Armed Forces Pacific", "Micronesia", "Marshall Islands", "Palau"],
  FR: ["Clipperton", "Terres Australes Françaises"],
};

// English display names (the original name is kept as an alias)
const ENGLISH = {
  DE: { "Bayern": "Bavaria", "Hessen": "Hesse", "Mecklenburg-Vorpommern": "Mecklenburg-Western Pomerania", "Niedersachsen": "Lower Saxony", "Nordrhein-Westfalen": "North Rhine-Westphalia", "Rheinland-Pfalz": "Rhineland-Palatinate", "Sachsen": "Saxony", "Sachsen-Anhalt": "Saxony-Anhalt", "Thüringen": "Thuringia" },
  AT: { "Kärnten": "Carinthia", "Niederösterreich": "Lower Austria", "Oberösterreich": "Upper Austria", "Steiermark": "Styria", "Tirol": "Tyrol", "Wien": "Vienna" },
  CH: { "Genève": "Geneva", "Luzern": "Lucerne", "Zürich": "Zurich", "Sankt Gallen": "St. Gallen", "Graubünden": "Grisons", "Bern": "Bern" },
  IT: { "Lombardia": "Lombardy", "Piemonte": "Piedmont", "Puglia": "Apulia", "Sardegna": "Sardinia", "Sicilia": "Sicily", "Toscana": "Tuscany", "Trentino-Alto Adige": "Trentino-South Tyrol", "Valle d'Aosta": "Aosta Valley" },
  FR: { "Bretagne": "Brittany", "Corse": "Corsica", "Normandie": "Normandy", "Guyane": "French Guiana", "Nouvelle-Calédonie": "New Caledonia", "Polynésie": "French Polynesia" },
  NL: { "Noord-Brabant": "North Brabant", "Noord-Holland": "North Holland", "Zuid-Holland": "South Holland" },
  GR: { "Anatolikí Makedonía kai Thráki": "East Macedonia and Thrace", "Attikḯ": "Attica", "Dytikí Elláda": "West Greece", "Dytikí Makedonía": "West Macedonia", "Ionía Nísia": "Ionian Islands", "Kentrikí Makedonía": "Central Macedonia", "Krítí": "Crete", "Notío Aigaío": "South Aegean", "Peloponnísos": "Peloponnese", "Stereá Elláda": "Central Greece", "Thessalía": "Thessaly", "Voreío Aigaío": "North Aegean", "Ípeiros": "Epirus", "Ágion Óros": "Mount Athos" },
  PL: { "Dolnośląskie": "Lower Silesia", "Kujawsko-pomorskie": "Kuyavia-Pomerania", "Łódzkie": "Łódź", "Lubelskie": "Lublin", "Lubuskie": "Lubusz", "Małopolskie": "Lesser Poland", "Mazowieckie": "Masovia", "Opolskie": "Opole", "Podkarpackie": "Subcarpathia", "Podlaskie": "Podlaskie", "Pomorskie": "Pomerania", "Śląskie": "Silesia", "Świętokrzyskie": "Holy Cross", "Warmińsko-mazurskie": "Warmia-Masuria", "Wielkopolskie": "Greater Poland", "Zachodniopomorskie": "West Pomerania" },
  PT: { "Açores": "Azores", "Lisboa": "Lisbon" },
  MX: { "Ciudad de México": "Mexico City", "Estado de México": "State of Mexico", "Coahuila de Zaragoza": "Coahuila", "Michoacán de Ocampo": "Michoacán", "Querétaro de Arteaga": "Querétaro" },
  CZ: { "Hlavní město Praha": "Prague", "Jihočeský kraj": "South Bohemia", "Jihomoravský kraj": "South Moravia", "Karlovarský kraj": "Karlovy Vary", "Královéhradecký kraj": "Hradec Králové", "Liberecký kraj": "Liberec", "Moravskoslezský kraj": "Moravia-Silesia", "Olomoucký kraj": "Olomouc", "Pardubický kraj": "Pardubice", "Plzeňský kraj": "Plzeň", "Středočeský kraj": "Central Bohemia", "Ústecký kraj": "Ústí nad Labem", "Vysočina": "Vysočina", "Zlínský kraj": "Zlín" },
  UA: { "Cherkaska oblast": "Cherkasy", "Chernihivska oblast": "Chernihiv", "Chernivetska oblast": "Chernivtsi", "Dnipropetrovska oblast": "Dnipropetrovsk", "Donetska oblast": "Donetsk", "Ivano-Frankivska oblast": "Ivano-Frankivsk", "Kharkivska oblast": "Kharkiv", "Khersonska oblast": "Kherson", "Khmelnytska oblast": "Khmelnytskyi", "Kyivska oblast": "Kyiv Oblast", "Kirovohradska oblast": "Kirovohrad", "Luhanska oblast": "Luhansk", "Lvivska oblast": "Lviv", "Mykolaivska oblast": "Mykolaiv", "Odeska oblast": "Odesa", "Poltavska oblast": "Poltava", "Rivnenska oblast": "Rivne", "Sumska oblast": "Sumy", "Ternopilska oblast": "Ternopil", "Vinnytska oblast": "Vinnytsia", "Volynska oblast": "Volyn", "Zakarpatska oblast": "Zakarpattia", "Zaporizka oblast": "Zaporizhzhia", "Zhytomyrska oblast": "Zhytomyr", "Avtonomna Respublika Krym": "Crimea", "Kyiv": "Kyiv City" },
  BE: { "Brussels": "Brussels", "Flanders": "Flanders", "Wallonia": "Wallonia" },
};

// Extra spellings and big cities → region (radio stations often list a city instead of a region)
const ALIASES = {
  US: {
    "New York": ["NYC", "New York City", "Manhattan", "Brooklyn", "Bronx", "Queens", "Long Island", "Buffalo", "Rochester", "Albany", "Syracuse"],
    "California": ["Los Angeles", "San Francisco", "San Diego", "San Jose", "Sacramento", "Oakland", "Fresno", "Bay Area", "Hollywood", "Long Beach", "Santa Barbara", "Santa Cruz", "Palm Springs", "Calif"],
    "Illinois": ["Chicago", "Springfield IL", "Peoria"],
    "Texas": ["Houston", "Dallas", "Austin", "San Antonio", "Fort Worth", "El Paso", "Dallas Fort Worth", "DFW"],
    "Florida": ["Miami", "Orlando", "Tampa", "Jacksonville", "Fort Lauderdale", "Key West", "Tallahassee", "West Palm Beach"],
    "Washington": ["Seattle", "Spokane", "Tacoma", "Washington State", "WA State"],
    "District of Columbia": ["Washington DC", "Washington D.C.", "Washington, D.C.", "Washington, DC", "DC", "D.C."],
    "Massachusetts": ["Boston", "Cambridge MA", "Worcester"],
    "Pennsylvania": ["Philadelphia", "Pittsburgh", "Harrisburg"],
    "Georgia": ["Atlanta", "Savannah"],
    "Arizona": ["Phoenix", "Tucson"],
    "Michigan": ["Detroit", "Grand Rapids", "Lansing"],
    "Colorado": ["Denver", "Boulder", "Colorado Springs"],
    "Nevada": ["Las Vegas", "Reno"],
    "Tennessee": ["Nashville", "Memphis", "Knoxville"],
    "Oregon": ["Portland", "Eugene"],
    "Minnesota": ["Minneapolis", "Saint Paul", "St. Paul", "Twin Cities", "Duluth"],
    "Louisiana": ["New Orleans", "Baton Rouge"],
    "Maryland": ["Baltimore"],
    "Missouri": ["St. Louis", "Saint Louis", "Kansas City"],
    "Ohio": ["Cleveland", "Columbus", "Cincinnati", "Toledo"],
    "North Carolina": ["Charlotte", "Raleigh", "Durham"],
    "Wisconsin": ["Milwaukee", "Madison"],
    "Utah": ["Salt Lake City"],
    "Indiana": ["Indianapolis"],
    "Kentucky": ["Louisville", "Lexington"],
    "Hawaii": ["Honolulu", "Hawai'i", "Hawaiʻi"],
    "Alaska": ["Anchorage", "Fairbanks", "Juneau"],
    "New Jersey": ["Newark", "Jersey City"],
    "Virginia": ["Richmond", "Norfolk", "Virginia Beach"],
    "Puerto Rico": ["San Juan"],
  },
  CA: {
    "Ontario": ["Toronto", "Ottawa", "Hamilton", "London ON", "Kitchener", "Windsor"],
    "Quebec": ["Québec", "Montreal", "Montréal", "Quebec City", "Laval", "Gatineau"],
    "British Columbia": ["Vancouver", "Victoria", "BC", "B.C.", "Kelowna"],
    "Alberta": ["Calgary", "Edmonton"],
    "Manitoba": ["Winnipeg"],
    "Saskatchewan": ["Regina", "Saskatoon"],
    "Nova Scotia": ["Halifax"],
    "Newfoundland and Labrador": ["Newfoundland", "St. John's"],
  },
  AU: {
    "New South Wales": ["Sydney", "Newcastle", "Wollongong", "NSW"],
    "Victoria": ["Melbourne", "Geelong", "VIC"],
    "Queensland": ["Brisbane", "Gold Coast", "Cairns", "Townsville", "QLD"],
    "Western Australia": ["Perth", "WA"],
    "South Australia": ["Adelaide"],
    "Tasmania": ["Hobart", "Launceston"],
    "Australian Capital Territory": ["Canberra", "ACT"],
    "Northern Territory": ["Darwin", "Alice Springs"],
  },
  DE: {
    "Bayern": ["Munich", "München", "Nürnberg", "Nuremberg", "Augsburg", "Regensburg", "Würzburg"],
    "Nordrhein-Westfalen": ["NRW", "Köln", "Cologne", "Düsseldorf", "Dortmund", "Essen", "Bonn", "Duisburg", "Münster", "Bielefeld", "Aachen", "Ruhrgebiet"],
    "Hessen": ["Frankfurt", "Frankfurt am Main", "Wiesbaden", "Kassel", "Darmstadt"],
    "Baden-Württemberg": ["Stuttgart", "Karlsruhe", "Mannheim", "Freiburg", "Heidelberg", "Ulm"],
    "Sachsen": ["Leipzig", "Dresden", "Chemnitz"],
    "Niedersachsen": ["Hannover", "Hanover", "Braunschweig", "Osnabrück", "Oldenburg", "Göttingen"],
    "Schleswig-Holstein": ["Kiel", "Lübeck", "Flensburg"],
    "Rheinland-Pfalz": ["Mainz", "Koblenz", "Trier", "Kaiserslautern"],
    "Thüringen": ["Erfurt", "Jena", "Weimar"],
    "Sachsen-Anhalt": ["Magdeburg", "Halle"],
    "Mecklenburg-Vorpommern": ["Rostock", "Schwerin"],
    "Brandenburg": ["Potsdam", "Cottbus"],
    "Saarland": ["Saarbrücken"],
  },
  AT: { "Wien": ["Vienna"], "Steiermark": ["Graz"], "Oberösterreich": ["Linz"], "Tirol": ["Innsbruck"], "Kärnten": ["Klagenfurt"] },
  CH: { "Zürich": ["Zurich"], "Genève": ["Geneva", "Genf"], "Bern": ["Berne"], "Basel-Stadt": ["Basel"], "Vaud": ["Lausanne"], "Ticino": ["Lugano"] },
  FR: {
    "Île-de-France": ["Paris", "Ile de France", "Versailles"],
    "Auvergne-Rhône-Alpes": ["Lyon", "Grenoble", "Saint-Étienne", "Clermont-Ferrand", "Rhône-Alpes", "Auvergne"],
    "Provence-Alpes-Côte d'Azur": ["PACA", "Marseille", "Nice", "Toulon", "Cannes", "Avignon", "Provence", "Côte d'Azur"],
    "Occitanie": ["Occitania", "Toulouse", "Montpellier", "Nîmes", "Perpignan", "Languedoc-Roussillon", "Midi-Pyrénées"],
    "Nouvelle-Aquitaine": ["Bordeaux", "Limoges", "Poitiers", "La Rochelle", "Aquitaine"],
    "Hauts-de-France": ["Lille", "Amiens", "Nord-Pas-de-Calais", "Picardie"],
    "Pays de la Loire": ["Nantes", "Angers", "Le Mans"],
    "Grand Est": ["Strasbourg", "Reims", "Metz", "Nancy", "Mulhouse", "Alsace", "Lorraine", "Champagne-Ardenne"],
    "Bretagne": ["Rennes", "Brest"],
    "Normandie": ["Rouen", "Caen", "Le Havre"],
    "Centre-Val de Loire": ["Orléans", "Tours"],
    "Bourgogne-Franche-Comté": ["Dijon", "Besançon", "Burgundy"],
  },
  IT: {
    "Lazio": ["Rome", "Roma"], "Lombardia": ["Milan", "Milano", "Bergamo", "Brescia"], "Campania": ["Naples", "Napoli", "Salerno"],
    "Piemonte": ["Turin", "Torino"], "Toscana": ["Florence", "Firenze", "Pisa", "Siena"], "Veneto": ["Venice", "Venezia", "Verona", "Padova", "Padua"],
    "Emilia-Romagna": ["Bologna", "Parma", "Modena", "Rimini"], "Sicilia": ["Palermo", "Catania", "Messina"], "Puglia": ["Bari", "Lecce"],
    "Liguria": ["Genoa", "Genova"], "Sardegna": ["Cagliari", "Sassari"], "Calabria": ["Reggio Calabria"],
    "Trentino-Alto Adige": ["Trentino", "Alto Adige", "South Tyrol", "Südtirol", "Bolzano", "Trento"], "Friuli-Venezia Giulia": ["Trieste", "Udine"],
  },
  NL: { "Noord-Holland": ["Amsterdam", "Haarlem"], "Zuid-Holland": ["Rotterdam", "The Hague", "Den Haag", "Leiden"], "Utrecht": [], "Noord-Brabant": ["Eindhoven", "Tilburg", "Breda"], "Groningen": [] },
  BE: { "Brussels": ["Bruxelles", "Brussel"], "Flanders": ["Vlaanderen", "Antwerp", "Antwerpen", "Ghent", "Gent", "Bruges", "Brugge", "Leuven"], "Wallonia": ["Wallonie", "Liège", "Namur", "Charleroi"] },
  PT: { "Lisboa": ["Lisbon"], "Porto": ["Oporto"], "Faro": ["Algarve"] },
  IE: { "Dublin": ["Dublin City"] },
  MX: { "Ciudad de México": ["CDMX", "Distrito Federal", "DF", "México DF", "Mexico DF"], "Jalisco": ["Guadalajara"], "Nuevo León": ["Monterrey"], "Baja California": ["Tijuana", "Mexicali"], "Quintana Roo": ["Cancún", "Cancun"] },
  BR: { "São Paulo": ["Sao Paulo"], "Rio de Janeiro": ["Rio"], "Distrito Federal": ["Brasília", "Brasilia"], "Minas Gerais": ["Belo Horizonte"], "Bahia": ["Salvador"], "Pernambuco": ["Recife"], "Ceará": ["Fortaleza"], "Rio Grande do Sul": ["Porto Alegre"], "Paraná": ["Curitiba"] },
  IN: {
    "Andaman and Nicobar Islands": ["Andaman and Nicobar", "Andaman", "Port Blair"],
    "Andhra Pradesh": ["Vijayawada", "Visakhapatnam", "Vizag", "Guntur", "Tirupati", "Nellore", "Kurnool", "Rajahmundry", "Amaravati"],
    "Arunachal Pradesh": ["Itanagar"],
    "Assam": ["Guwahati", "Gauhati", "Dibrugarh", "Silchar", "Jorhat", "Tezpur"],
    "Bihar": ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga"],
    "Chandigarh": [],
    "Chhattisgarh": ["Chattisgarh", "Chhatisgarh", "Raipur", "Bilaspur", "Jagdalpur", "Ambikapur"],
    "Dadra and Nagar Haveli and Daman and Diu": ["Dadra and Nagar Haveli", "Daman and Diu", "Daman", "Diu", "Silvassa"],
    "Delhi": ["New Delhi", "NCT of Delhi", "National Capital Territory of Delhi", "NCT Delhi", "Delhi NCR", "NCR"],
    "Goa": ["Panaji", "Panjim", "Margao", "Vasco da Gama"],
    "Gujarat": ["Ahmedabad", "Surat", "Vadodara", "Baroda", "Rajkot", "Bhuj", "Gandhinagar"],
    "Haryana": ["Gurgaon", "Gurugram", "Faridabad", "Rohtak", "Hisar", "Kurukshetra", "Panipat", "Ambala"],
    "Himachal Pradesh": ["Shimla", "Simla", "Dharamshala", "Mandi", "Hamirpur", "Kullu", "Manali"],
    "Jammu and Kashmir": ["J&K", "J & K", "Kashmir", "Srinagar", "Jammu"],
    "Jharkhand": ["Ranchi", "Jamshedpur", "Dhanbad", "Hazaribagh", "Daltonganj"],
    "Karnataka": ["Bangalore", "Bengaluru", "Mysore", "Mysuru", "Mangalore", "Mangaluru", "Hubli", "Dharwad", "Belgaum", "Gulbarga", "Kalaburagi"],
    "Kerala": ["Kochi", "Cochin", "Ernakulam", "Thiruvananthapuram", "Trivandrum", "Kozhikode", "Calicut", "Thrissur", "Kannur", "Alappuzha"],
    "Ladakh": ["Leh", "Kargil"],
    "Lakshadweep": ["Kavaratti"],
    "Madhya Pradesh": ["Bhopal", "Indore", "Gwalior", "Jabalpur", "Ujjain", "Rewa", "Sagar"],
    "Maharashtra": ["Mumbai", "Bombay", "Pune", "Poona", "Nagpur", "Nashik", "Aurangabad", "Kolhapur", "Thane", "Navi Mumbai", "Solapur"],
    "Manipur": ["Imphal"],
    "Meghalaya": ["Shillong", "Tura"],
    "Mizoram": ["Aizawl"],
    "Nagaland": ["Kohima", "Dimapur"],
    "Odisha": ["Orissa", "Bhubaneswar", "Bhubaneshwar", "Cuttack", "Sambalpur", "Puri", "Berhampur"],
    "Puducherry": ["Pondicherry", "Pondy", "Karaikal"],
    "Punjab": ["Amritsar", "Ludhiana", "Jalandhar", "Jalandar", "Patiala", "Bathinda", "Mohali"],
    "Rajasthan": ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Bikaner", "Ajmer"],
    "Sikkim": ["Gangtok"],
    "Tamil Nadu": ["Tamilnadu", "Chennai", "Madras", "Coimbatore", "Madurai", "Tiruchirappalli", "Trichy", "Salem", "Tirunelveli", "Ooty"],
    "Telangana": ["Hyderabad", "Secunderabad", "Warangal", "Nizamabad"],
    "Tripura": ["Agartala"],
    "Uttar Pradesh": ["Lucknow", "Kanpur", "Varanasi", "Banaras", "Agra", "Allahabad", "Prayagraj", "Noida", "Greater Noida", "Ghaziabad", "Meerut", "Gorakhpur", "Bareilly", "Aligarh", "Mathura"],
    "Uttarakhand": ["Uttaranchal", "Dehradun", "Dehra Dun", "Haridwar", "Rishikesh", "Nainital", "Almora"],
    "West Bengal": ["Kolkata", "Calcutta", "Siliguri", "Darjeeling", "Durgapur", "Asansol", "Kurseong"],
  },
  JP: { "Tokyo": ["Tōkyō", "Tokyo-to"], "Osaka": ["Ōsaka", "Osaka-fu"], "Kyoto": ["Kyōto", "Kyoto-fu"], "Hokkaido": ["Hokkaidō", "Sapporo"], "Hyogo": ["Hyōgo", "Kobe"], "Fukuoka": ["Kitakyushu"], "Aichi": ["Nagoya"], "Kanagawa": ["Yokohama", "Kawasaki"] },
  CZ: { "Hlavní město Praha": ["Praha", "Prague"], "Jihomoravský kraj": ["Brno"], "Moravskoslezský kraj": ["Ostrava"] },
  PL: { "Mazowieckie": ["Warsaw", "Warszawa"], "Małopolskie": ["Kraków", "Krakow", "Cracow"], "Dolnośląskie": ["Wrocław", "Wroclaw"], "Wielkopolskie": ["Poznań", "Poznan"], "Pomorskie": ["Gdańsk", "Gdansk", "Gdynia"], "Łódzkie": ["Łódź", "Lodz"], "Śląskie": ["Katowice"] },
  RU: { "Moscow": ["Moskva", "Москва"], "Saint Petersburg": ["St. Petersburg", "Sankt-Peterburg", "Санкт-Петербург"] },
  NZ: { "Auckland": [], "Wellington": [], "Canterbury": ["Christchurch"], "Otago": ["Dunedin", "Queenstown"] },
  ZA: { "Gauteng": ["Johannesburg", "Pretoria"], "Western Cape": ["Cape Town"], "KwaZulu-Natal": ["Durban"] },
  AR: { "Capital Federal": ["Buenos Aires City", "CABA", "Ciudad Autónoma de Buenos Aires", "Ciudad de Buenos Aires"] },
  CO: { "Bogotá D.C.": ["Bogotá", "Bogota"], "Antioquia": ["Medellín", "Medellin"], "Valle del Cauca": ["Cali"], "Atlántico": ["Barranquilla"] },
};

const out = {};
let warnings = 0;
for (const c of data) {
  const cc = c.countryShortCode;
  let regions;
  if (REPLACE[cc]) {
    regions = REPLACE[cc].map(([name, code, aliases]) => [name, code, aliases]);
  } else {
    const drop = new Set(DROP[cc] || []);
    regions = c.regions.filter((r) => !drop.has(r.name)).map((r) => {
      const english = ENGLISH[cc] && ENGLISH[cc][r.name];
      const aliases = [];
      if (english && english !== r.name) aliases.push(r.name);
      aliases.push(...((ALIASES[cc] && ALIASES[cc][r.name]) || []));
      // Only letter codes are useful for matching ("TX", "NSW"); numeric codes aren't
      return [english || r.name, /^[A-Z]{2,3}$/.test(r.shortCode || "") ? r.shortCode : "", aliases];
    });
  }
  for (const [table, name] of [[ENGLISH, "ENGLISH"], [ALIASES, "ALIASES"], [DROP, "DROP"]]) {
    if (!table[cc] || REPLACE[cc]) continue;
    const keys = Array.isArray(table[cc]) ? table[cc] : Object.keys(table[cc]);
    for (const k of keys) if (!c.regions.some((r) => r.name === k)) { console.warn(`${name}.${cc}: no region named "${k}"`); warnings++; }
  }
  // Compact output: drop empty fields
  out[cc] = regions.map(([n, code, a]) => (a.length ? [n, code, a] : code ? [n, code] : [n]));
}
const file = path.join(__dirname, "..", "regions.json");
fs.writeFileSync(file, JSON.stringify(out));
console.log(`Wrote ${Object.keys(out).length} countries, ${Object.values(out).reduce((n, r) => n + r.length, 0)} regions → regions.json (${(fs.statSync(file).size / 1024).toFixed(0)} KB)${warnings ? `, ${warnings} warnings` : ""}`);
