FROM node:18-alpine AS build
WORKDIR /app

# Add build arguments for Vite
ARG CHATKIT_WORKFLOW_ID
ARG MSAL_CLIENT_ID
ARG MSAL_TENANT_ID
ARG MSAL_REDIRECT_URI
ENV CHATKIT_WORKFLOW_ID=$CHATKIT_WORKFLOW_ID
ENV MSAL_CLIENT_ID=$MSAL_CLIENT_ID
ENV MSAL_TENANT_ID=$MSAL_TENANT_ID
ENV MSAL_REDIRECT_URI=$MSAL_REDIRECT_URI

# Install dependencies and build
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --legacy-peer-deps
COPY frontend/ ./
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
