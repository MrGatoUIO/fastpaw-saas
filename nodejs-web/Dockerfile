FROM node:18-alpine

# Instalar dependencias del sistema
RUN apk add --no-cache \
    postgresql-client \
    curl \
    && rm -rf /var/cache/apk/*

# Configurar directorio de trabajo
WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias de Node.js
RUN npm install --only=production && npm cache clean --force

# Copiar código fuente
COPY . .

# Crear usuario no-root para seguridad
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Exponer puerto
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Comando para iniciar la aplicación
CMD ["npm", "start"]