# Étape 1 : Construction (Builder)
FROM node:22-alpine AS builder

WORKDIR /app

# Copie des manifestes de dépendances
COPY package.json package-lock.json ./

# Installation propre de l'ensemble des dépendances (y compris devDependencies pour le build)
RUN npm ci

# Copie de tout le code source
COPY . .

# Compilation de l'application SvelteKit avec @sveltejs/adapter-node
RUN npm run build

# Élagage des dépendances de développement pour alléger l'image
RUN npm prune --omit=dev


# Étape 2 : Image finale de production (Runner)
FROM node:22-alpine AS runner

WORKDIR /app

# Variables d'environnement par défaut
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0

# Copie des fichiers compilés et des modules de production
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/build ./build

# Création du répertoire de données persistant (/app/data) et attribution des droits à node
RUN mkdir -p /app/data && chown -R node:node /app

# Exécution sous l'utilisateur non-root par sécurité
USER node

# Port exposé
EXPOSE 3000

# Vérification de l'état de santé du conteneur
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/login || exit 1

# Démarrage de l'application
CMD ["node", "build/index.js"]
