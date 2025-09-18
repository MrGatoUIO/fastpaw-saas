# Multi-stage build para optimizar tamaño

# Stage 1: Build
FROM node:18-alpine as builder

WORKDIR /app

# Copiar package.json y package-lock.json
COPY package*.json ./

# Instalar dependencias
RUN npm install --silent

# Copiar código fuente
COPY . .

# Build para producción
RUN npm run build

# Stage 2: Serve
FROM nginx:alpine

# Copiar configuración personalizada de nginx
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar archivos build desde stage anterior
COPY --from=builder /app/build /usr/share/nginx/html

# Exponer puerto
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000 || exit 1

# Comando para iniciar nginx
CMD ["nginx", "-g", "daemon off;"]