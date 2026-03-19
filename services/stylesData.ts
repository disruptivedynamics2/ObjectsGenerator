export interface DesignStyle {
  id: number;
  name: string;
  nameEN: string;
  field: string;
  signal: string;
  palette: string;
  materials: string;
  description: string;
  objectTypes: string;
  promptModifiers: string;
}

export const DESIGN_STYLES: DesignStyle[] = [
  {
    id: 1,
    name: "Organic Modern",
    nameEN: "Organic Modern",
    field: "Intérieur / mixte",
    signal: "Très fort",
    palette: "ivoire, sable, greige chaud, pierre, sauge grisée, brun terre",
    materials: "chêne blanc, travertin, plâtre,",
    description: "L\\'Organic Modern est aujourd\\'hui l\\'un des langages visuels les plus demandés aux US parce qu\\'il réconcilie sophistication contemporaine et apaisement sensoriel. Le style évite le minimalisme froid: les lignes restent épurées mais elles sont assouplies par des volumes arrondis, des surfaces minérales, des bois blonds ou miellés et des finitions légèrement imparfaites qui donnent un sentiment...",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "bois, lin, Outdoor, blanc, chêne, Canapé, compatible, Table"
  },
  {
    id: 2,
    name: "Warm Minimalism",
    nameEN: "Warm Minimalism",
    field: "Intérieur",
    signal: "Très fort",
    palette: "crème, avoine, biscuit, lin, taupe chaud, caramel clair",
    materials: "bois miellé, laine plate, lin,",
    description: "Le Warm Minimalism répond à la fatigue visuelle produite par les intérieurs trop froids ou trop chargés. On conserve l\\'économie de moyens du minimalisme - peu d\\'objets, silhouettes lisibles, circulation fluide - mais on injecte chaleur, douceur et confort d\\'usage",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "bois, taupe, chaud, Textiles, écru, Canapé, Table, Meuble"
  },
  {
    id: 3,
    name: "Japandi",
    nameEN: "Japandi",
    field: "Intérieur",
    signal: "Très fort",
    palette: "écru, beige grisé, bois blond fumé, vert mousse, argile, noir charbon",
    materials: "frêne, chêne clair fumé, papier,",
    description: "Le Japandi reste très demandé aux US car il combine le calme japonais, la fonctionnalité scandinave et une forte culture de l\\'objet bien dessiné. La pièce est ordonnée, basse, respirante, mais pas vide",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "bois, grès, fumé, repas, chêne, écru, Canapé, Chaise"
  },
  {
    id: 4,
    name: "Wabi-Sabi contemporain",
    nameEN: "Wabi-Sabi contemporain",
    field: "Intérieur",
    signal: "Fort",
    palette: "craie, sable sec, taupe minéral, gris pierre, brun brûlé, noir dilué",
    materials: "argile, chaux, bois brossé, pierre",
    description: "Le Wabi-Sabi contemporain pousse plus loin la recherche de calme en assumant l\\'irrégularité, la patine et l\\'inachevé maîtrisé. C\\'est un style moins décoratif que le Japandi et plus minéral",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "lin, grisé, chêne, argile, brossé, Canapé, bronze, céramique"
  },
  {
    id: 5,
    name: "Transitional haut de gamme",
    nameEN: "Transitional haut de gamme",
    field: "Intérieur",
    signal: "Très fort",
    palette: "mastic, crème, taupe, grège chaud, brun cacao, noir doux",
    materials: "bois moyen, marbre doux, laque",
    description: "Le Transitional reste une des grammaires les plus sûres du marché US parce qu\\'il marie base classique et épure contemporaine. Dans sa version actuelle, il a perdu le gris froid qui l\\'a longtemps dominé",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "taupe, bois, repas, noir, Canapé, laiton, chauds, Table"
  },
  {
    id: 6,
    name: "Quiet Luxury / luxe discret",
    nameEN: "Quiet Luxury",
    field: "Intérieur",
    signal: "Fort",
    palette: "crème, camel, mastic, olive sombre, chocolat, bordeaux assourdi",
    materials: "walnut, marbre veiné doux, laine",
    description: "Le Quiet Luxury n\\'est pas un style ostentatoire; c\\'est une stratégie de qualité. Les volumes restent calmes, les couleurs mesurées, mais les matériaux, les proportions et la finition racontent une vraie montée en gamme",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "grisé, vert, Salle, velours, cognac, bronze, olive, sombre"
  },
  {
    id: 7,
    name: "New Traditional",
    nameEN: "New Traditional",
    field: "Intérieur",
    signal: "Très fort",
    palette: "parchment, olive, bleu grisé, brun riche, bordeaux doux, crème chaude",
    materials: "noyer, chêne moyen, laiton patiné,",
    description: "Le New Traditional est le grand retour du détail classique dans une maison pensée pour la vie actuelle. On retrouve le langage des moulures, des placards à cadre, des arches, des niches, des bibliothèques, des lampes à abat-jour, des motifs hérités, mais sur une base plus confortable et moins guindée qu\\'autrefois",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "bois, taupe, repas, Textiles, Bibliothèque, Canapé, olive, laiton"
  },
  {
    id: 8,
    name: "English Country Revival",
    nameEN: "English Country Revival",
    field: "Intérieur",
    signal: "Très fort",
    palette: "mousse, bleu encre, tabac, crème beige, brun foncé",
    materials: "bois foncé, laiton ancien, lin",
    description: "L\\'English Country revient fortement aux US car il offre l\\'antidote parfait aux intérieurs trop lisses: des pièces chaleureuses, vécues, un peu romanesques, mais extrêmement confortables. C\\'est un style de maison plus que de décor",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "bois, lin, vert, Couleurs, Canapé, olive, Table, Cuisine"
  },
  {
    id: 9,
    name: "Modern Tudor / Heritage Revival",
    nameEN: "Modern Tudor",
    field: "Intérieur / architecture",
    signal: "Fort",
    palette: "ivoire cassé, vert forêt, brun châtain, noir charcoal",
    materials: "chêne fumé, fer noir, pierre",
    description: "Le Modern Tudor et plus largement le Heritage Revival remettent à l\\'honneur une esthétique patrimoniale anglo-américaine: arches, boiseries, quincaillerie sombre, ferronnerie, plafonds marqués, textures historiques. La version actuelle évite l\\'effet parc à thème",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "bois, fumé, vert, chêne, Entrée, noir, olive, tabac"
  },
  {
    id: 10,
    name: "French Country contemporain",
    nameEN: "French Country contemporain",
    field: "Intérieur",
    signal: "Très fort",
    palette: "crème, lin, sauge, bleu grisé, beurre blanc, ocre doux",
    materials: "bois patiné, pierre claire, lin,",
    description: "Le French Country contemporain connaît une vraie poussée d\\'intérêt aux US car il offre une élégance romantique mais habitable. On cherche moins la rusticité pure que le mélange entre douceur campagnarde, pièces vintage, pierre claire, boiseries travaillées, floraux discrets et confort moderne",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "bois, lin, repas, sauge, laiton, Canapé, mastic, Accessoires"
  },
  {
    id: 11,
    name: "Casual Classic American / Nancy Meyers",
    nameEN: "Casual Classic American",
    field: "Intérieur",
    signal: "Fort",
    palette: "blanc cassé, crème, sable, bleu doux, caramel, naturel",
    materials: "chêne miel, marbre clair, lin,",
    description: "Le Casual Classic American - souvent associé à l\\'imaginaire Nancy Meyers - reste extrêmement désiré aux US. Il met en scène une maison confortable, lumineuse, rangée mais vivante, où la cuisine, le family room et la chambre principale ressemblent à des versions idéalisées de la vie quotidienne",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "bois, doux, Entrée, écru, Canapé, marbre, Family, sable"
  },
  {
    id: 12,
    name: "California Casual",
    nameEN: "California Casual",
    field: "Intérieur / mixte",
    signal: "Fort",
    palette: "blanc chaud, sable, camel, bleu ciel, vert tendre",
    materials: "bois délavé, rotin, jute, lin,",
    description: "Le California Casual mélange décontraction côtière, naturalité et sophistication discrète. L\\'espace doit paraître ouvert, facile à vivre, très lumineux, un peu solaire, sans tomber dans le thème plage",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "Fauteuil, camel, lin, chaud, blanc, chêne, Extérieur, écru"
  },
  {
    id: 13,
    name: "Coastal Contemporary",
    nameEN: "Coastal Contemporary",
    field: "Intérieur / extérieur",
    signal: "Fort",
    palette: "blanc sel, sable, bleu côtier, gris pierre, coquille",
    materials: "chêne blanchi, corde, lin, verre,",
    description: "Le Coastal Contemporary est la version adulte et architecturée du style bord de mer. Il abandonne les motifs marins littéraux pour privilégier la sensation: air, lumière, matières blanchies, bleus désaturés, teintes sableuses, formes souples et connexion avec le paysage",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "typique, lin, Outdoor, repas, blanc, teck, Chaise, Canapé"
  },
  {
    id: 14,
    name: "Midcentury Modern Revival",
    nameEN: "Midcentury Modern Revival",
    field: "Intérieur",
    signal: "Fort",
    palette: "noyer, caramel, ocre, olive, bleu pétrole, taupe",
    materials: "noyer, teck, cuir cognac, laine,",
    description: "Le Midcentury Modern ne disparaît jamais aux US, mais sa version actuelle s\\'adoucit: moins muséale, plus habitable, plus texturée. On conserve les icônes - bois chaud, pieds compas, silhouettes aériennes, compositions graphiques - mais on les combine avec des palettes plus terreuses, des tissus plus tactiles et une présence plus confortable",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "bois, cognac, Buffet, Couleurs, Chaise, Canapé, olive, laiton"
  },
  {
    id: 15,
    name: "Neo Deco",
    nameEN: "Neo Deco",
    field: "Intérieur",
    signal: "Très fort",
    palette: "bordeaux, vert bouteille, aubergine, or, noir laqué",
    materials: "noyer sombre, laque, velours,",
    description: "Le Neo Deco est l\\'une des signatures montantes de 2026: il reprend le glamour Art déco mais en version plus vivable, plus éditoriale et moins théâtrale. On y retrouve la sensualité des bois sombres, des tissus profonds, des laques, des métaux brillants et des lignes géométriques, mais avec une composition plus souple et plus contemporaine",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "fumé, chaud, vert, laiton, Canapé, marbre, métal, Table"
  },
  {
    id: 16,
    name: "Collected Vintage Eclectic",
    nameEN: "Collected Vintage Eclectic",
    field: "Intérieur",
    signal: "Très fort",
    palette: "crème chaude, tabac, olive, bleu délavé, or chaud",
    materials: "bois patiné, laiton ancien, laine,",
    description: "Le Collected Vintage Eclectic répond au désir de maisons moins génériques. Il s\\'agit d\\'un intérieur composé comme une collection vivante: pièces vintage, trouvailles seconde main, héritages familiaux, objets artisanaux et quelques éléments contemporains viennent dialoguer sans chercher l\\'homogénéité absolue",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "bois, Buffet, Éclairage, marbre, Table, noyer, Palette, Salon"
  },
  {
    id: 17,
    name: "Narrative Maximalism",
    nameEN: "Narrative Maximalism",
    field: "Intérieur",
    signal: "Très fort",
    palette: "palette libre mais structurée: baie, rose, ciel, orange",
    materials: "velours, coton imprimé, bois",
    description: "Le Narrative Maximalism n\\'est pas un simple \\'more is more\\'. C\\'est un maximalisme personnel, composé, habité, où motifs, couleurs, œuvres, objets et meubles racontent un récit",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "vert, Textiles, Canapé, olive, sombre, Salle, bleu, manger"
  },
  {
    id: 18,
    name: "Color-Drenched Moody",
    nameEN: "Color-Drenched Moody",
    field: "Intérieur",
    signal: "Très fort",
    palette: "aubergine, olive sombre, pétrole, chocolat, plum",
    materials: "peinture mate, velours, bois",
    description: "Le Color-Drenched Moody repose sur une immersion colorée: murs, plafonds, menuiseries, textiles et parfois mobilier restent dans une même famille chromatique ou dans des écarts très proches. Le but n\\'est pas la monochromie stricte mais l\\'atmosphère enveloppante",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "bois, vert, cognac, laiton, olive, Bibliothèque, pierre, Powder"
  },
  {
    id: 19,
    name: "Grandma Chic / Cottage Nostalgia",
    nameEN: "Grandma Chic",
    field: "Intérieur",
    signal: "Montant",
    palette: "rose fané, vert feuille, bleu porcelaine, crème rosée",
    materials: "coton imprimé, bois peint, cannage,",
    description: "Le Grandma Chic remet en circulation un imaginaire longtemps jugé démodé: quilts, floraux, jupes de table, abat-jour plissés, vaisselle héritée, cadres, petits bibelots, patchworks, rubans, dentelles et meubles sentimentaux. La version actuelle n\\'est pas une reconstitution vieillotte; elle mélange nostalgie, confort et humour, avec souvent une conscience écologique liée au vintage et à la seco...",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "bois, pâle, cuisine, rose, doux, vert, sauge, blanc"
  },
  {
    id: 20,
    name: "Modern Farmhouse 2.0",
    nameEN: "Modern Farmhouse 2.0",
    field: "Intérieur / extérieur",
    signal: "Fort",
    palette: "crème chaude, vert sauge, gris doux, blanc cassé, noir tendre",
    materials: "bois de ferme, métal noir doux,",
    description: "Le Modern Farmhouse n\\'a pas disparu aux US; il a muté. La version 2.0 tourne le dos au tout blanc générique et gagne en chaleur, en matière et en authenticité",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "bois, doux, cognac, sauge, teck, Extérieur, noir, Salle"
  },
  {
    id: 21,
    name: "Mediterranean Modern",
    nameEN: "Mediterranean Modern",
    field: "Intérieur / extérieur",
    signal: "Fort",
    palette: "blanc chaud, sable, terracotta, olivier, bleu cobalt",
    materials: "stuc, travertin, terre cuite, bois",
    description: "Le Mediterranean Modern répond très bien à la recherche actuelle de maisons solaires, sensorielles et intemporelles. Il puise dans les maisons du sud de l\\'Europe, de Californie et du désert: arcs, stuc, pierre, enduits, bois sombre ou miel, fer, céramique, terracotta, lin, formes massives mais douces",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "bois, lin, Chambre, blanc, cassé, pierre, sable, travertin"
  },
  {
    id: 22,
    name: "Desert Modern / Southwestern Modern",
    nameEN: "Desert Modern",
    field: "Intérieur / extérieur",
    signal: "Fort",
    palette: "sable rosé, adobe, rouille, vert sage, noir dilué",
    materials: "stucco, pierre sèche, cuir cognac,",
    description: "Le Desert Modern est particulièrement pertinent sur le marché US parce qu\\'il relie architecture moderne, paysages arides et palette chaude. Il ne faut pas le réduire au folklore Santa Fe: la version actuelle est plus épurée, plus architecturée, souvent influencée par Palm Springs, le Nouveau-Mexique, l\\'Arizona et la Californie",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "fumé, Outdoor, cognac, béton, noyer, Salle, sable, cuir"
  },
  {
    id: 23,
    name: "Biophilic Wellness Spa",
    nameEN: "Biophilic Wellness Spa",
    field: "Intérieur / extérieur",
    signal: "Très fort",
    palette: "vert sauge, pierre, sable, blanc calme, gris minéral",
    materials: "bois clair, pierre naturelle,",
    description: "Le Biophilic Wellness Spa organise la maison comme un sanctuaire. Il ne se limite pas à ajouter des plantes: il cherche à provoquer une sensation de récupération physique et mentale par la lumière, l\\'air, les textures naturelles, les parcours fluides et les équipements bien-être",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "bois, Jardin, Recovery, Couleurs, écru, Salle, pierre, Chambre"
  },
  {
    id: 24,
    name: "Equestrian Elegance",
    nameEN: "Equestrian Elegance",
    field: "Intérieur",
    signal: "Montant",
    palette: "cognac, bordeaux, vert forêt, marine, crème",
    materials: "cuir lisse, noyer sombre, tweed,",
    description: "L\\'Equestrian Elegance revient aux US sous une forme sophistiquée et non littérale. Il ne s\\'agit pas de multiplier fers à cheval et iconographie trop explicite, mais de convoquer un imaginaire de tradition sportive, de sellerie, de beaux matériaux et de raffinement patrimonial",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "Fauteuil, bois, taupe, Banquette, Bureau, cognac, blanc, noir"
  },
  {
    id: 25,
    name: "Contemporary Indoor-Outdoor Lounge",
    nameEN: "Contemporary Indoor-Outdoor Lounge",
    field: "Extérieur / mixte",
    signal: "Très fort",
    palette: "sable, grège, charbon doux, blanc pur, gris clair",
    materials: "aluminium poudré, teck, corde,",
    description: "Le Contemporary Indoor-Outdoor Lounge traite la terrasse ou le patio comme une vraie pièce de la maison. C\\'est l\\'une des évolutions majeures du marché US: assises outdoor plus proches du salon, tapis, tables d\\'appoint, éclairage rechargeable, textiles coordonnés, cuisines extérieures, zones conversationnelles",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "taupe, Shading, Dining, teck, Canapé, Décor, Table, pierre"
  },
  {
    id: 26,
    name: "Palm Springs Resort Outdoor",
    nameEN: "Palm Springs Resort Outdoor",
    field: "Extérieur",
    signal: "Très fort",
    palette: "blanc, noir, sable, terracotta, red clay",
    materials: "aluminium, tissu performance, rotin",
    description: "Le Palm Springs Resort Outdoor réunit esprit resort, rétro 60s, luxe solaire et confort conversationnel. Très présent dans les tendances outdoor récentes, il évoque les piscines d\\'hôtel, les loungers alignés, les rayures, les tables cocktail, les couleurs chaudes et les formes arrondies",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "Fauteuil, béton, Lounger, Table, sable, crème, corde, Palette"
  },
  {
    id: 27,
    name: "French Riviera Cabana Outdoor",
    nameEN: "French Riviera Cabana Outdoor",
    field: "Extérieur",
    signal: "Fort",
    palette: "marine adouci, blanc cassé, sable, or chaud",
    materials: "toile rayée, teck, aluminium,",
    description: "Le French Riviera Cabana Outdoor est une déclinaison plus préppy et plus chic du resort. On pense cabana stripes, transats élégants, parasols soignés, bars terrasse, touches nautiques abstraites et ambiance club de plage haut de gamme",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "longue, Banquette, teck, Guéridon, Chaise, métal, pierre, crème"
  },
  {
    id: 28,
    name: "Mediterranean Xeriscape Courtyard",
    nameEN: "Mediterranean Xeriscape Courtyard",
    field: "Extérieur",
    signal: "Très fort",
    palette: "sable, pierre, olive, terracotta, bleu côtier",
    materials: "gravier, pierre, stuc, fer, bois,",
    description: "Le Mediterranean Xeriscape Courtyard répond à deux demandes US très fortes: le style solaire méditerranéen et l\\'économie d\\'eau. Il transforme l\\'extérieur en cour minérale vivante, avec graviers, pierre, oliviers, plantes résistantes, pots, enduits chauds et mobilier simple mais raffiné",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "stuc, Banquette, chaud, blanc, noir, écru, Plantations, pierre"
  },
  {
    id: 29,
    name: "Tropical Modern Terrace",
    nameEN: "Tropical Modern Terrace",
    field: "Extérieur / mixte",
    signal: "Fort",
    palette: "ivoire, teck, vert feuillage, terracotta, ciel",
    materials: "teck, corde, pierre, béton lissé,",
    description: "Le Tropical Modern Terrace prend les codes du resort tropical - végétation luxuriante, bois, eau, ombre, tissus légers - et les modernise par une architecture nette et un mobilier plus épuré. Très utile pour les marchés chauds ou les projets de vacation homes, il évite l\\'esthétique coloniale trop littérale ou le tiki caricatural",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "Dining, teck, écru, ivoire, Canapé, Décor, pierre, sable"
  },
  {
    id: 30,
    name: "Modern Cottage Garden Outdoor",
    nameEN: "Modern Cottage Garden Outdoor",
    field: "Extérieur",
    signal: "Fort",
    palette: "vert feuille, crème, rose fané, lavande, gris tendre",
    materials: "bois peint, teck, métal léger,",
    description: "Le Modern Cottage Garden Outdoor actualise le jardin romantique en lui donnant plus de structure. Il conserve les floraisons abondantes, les coins assis, les bancs, les allées, les pots et les clôtures végétalisées, mais avec un mobilier plus sobre et une mise en scène plus lisible",
    objectTypes: "Assises, Tables, Rangement, Luminaires, Textiles, Décor",
    promptModifiers: "bois, repas, sauge, noir, métal, Décor, Porche, crème"
  },
];