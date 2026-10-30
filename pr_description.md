🎯 **What:** Le but de ce PR est de combler le manque de tests pour la fonction \`isSeparatorChannel\` dans le fichier \`lib/iptv-service.ts\`. Une correction de bug a également été effectuée concernant l'expression régulière identifiant les préfixes de type headers.
📊 **Coverage:** Les tests couvrent à présent :
- Les cas avec des valeurs nulles ou non définies.
- Les cas où le nom de la chaîne ou l'URL du flux est vide.
- Les cas de chaînes servant uniquement de séparateurs avec divers types de caractères.
- Les cas valides normaux.
✨ **Result:** Amélioration significative de la couverture de test, garantissant le comportement correct de la fonction \`isSeparatorChannel\` et corrigeant de ce fait un bug avec les regex identifiant les headers (\`<<<\` et \`>>>\`).
