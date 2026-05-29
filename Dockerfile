# Use the official lightweight alpine-based Nginx image
FROM nginx:alpine

# Copy custom Nginx configuration file
COPY nginx.conf /etc/nginx/nginx.conf

# Copy static website assets to Nginx default html directory
COPY . /usr/share/nginx/html/

# Remove default Nginx configuration files to prevent conflicts
RUN rm -rf /etc/nginx/conf.d

# Google Cloud Run injects the PORT environment variable (default 8080)
# and expects Nginx to bind to it. 
EXPOSE 8080

# Start Nginx in foreground mode so Docker tracks process life cycle
CMD ["nginx", "-g", "daemon off;"]
