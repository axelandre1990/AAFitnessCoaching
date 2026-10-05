# Sources du catalogue alimentaire (préparation V4)

Toutes les valeurs nutritives du catalogue sont normalisées pour 100 g. Les valeurs d'énergie, protéines, glucides, lipides et fibres conservent la provenance de chaque entrée via `source` et `sourceRef`.

- `AA_CUSTOM` : aliments déjà présents dans le classeur fourni « Nutrition Plan Builder: Master Food Sources Database [FR] ».
- `CIQUAL_2025` : Anses, Table de composition nutritionnelle des aliments Ciqual 2025. Licence Ouverte / Open Licence 2.0. Attribution requise : « Anses. 2025. Table de composition nutritionnelle des aliments Ciqual 2025. https://doi.org/10.57745/RDMHWY ».
- `USDA_FOUNDATION_2026` : USDA FoodData Central Foundation Foods, release 2026-04-30. CC0 1.0. Attribution recommandée : « U.S. Department of Agriculture, Agricultural Research Service. FoodData Central, 2026. fdc.nal.usda.gov ».
- `USDA_FNDDS_2021_2023` : USDA FoodData Central FNDDS 2021-2023. Données du domaine public / CC0 1.0.
- `USDA_SR_LEGACY_2018` : USDA FoodData Central SR Legacy, release 2018-04. Données du domaine public / CC0 1.0; cette série est archivée et n'est plus mise à jour.

Le catalogue ne contient pas de données Cronometer/NCCDB. NCCDB est disponible sous licence et ne doit être ajoutée qu'après accord avec le Nutrition Coordinating Center. Les valeurs et libellés des sources USDA sont en anglais dans cette préparation. Les champs nutriments manquants sont laissés à `null`; aucune valeur n'est imputée.
