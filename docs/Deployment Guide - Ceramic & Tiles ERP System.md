# Deployment Guide - Ceramic & Tiles ERP System

This guide covers deploying the ERP system to production environments.

## System Requirements

### Minimum Requirements

- **Server:** 2 CPU cores, 4GB RAM, 50GB storage
- **Operating System:** Ubuntu 22.04 LTS or similar
- **Node.js:** v22.x or higher
- **PostgreSQL:** v14 or higher
- **Network:** HTTPS enabled, ports 80/443 accessible

### Recommended for Production

- **Server:** 4 CPU cores, 8GB RAM, 100GB SSD storage
- **Database:** Separate PostgreSQL server with backups
- **Load Balancer:** For high availability
- **CDN:** For static assets
- **Monitoring:** Application and database monitoring

## Pre-Deployment Checklist

- [ ] Update environment variables for production
- [ ] Change default admin password
- [ ] Configure database backups
- [ ] Set up SSL certificates
- [ ] Configure firewall rules
- [ ] Set up monitoring and logging
- [ ] Test all critical features
- [ ] Prepare rollback plan

## Deployment Options

### Option 1: Traditional VPS Deployment

#### 1. Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PostgreSQL
sudo apt install postgresql postgresql-contrib

# Install PM2 for process management
sudo npm install -g pm2

# Install Nginx
sudo apt install nginx
```

#### 2. Database Setup

```bash
# Create production database
sudo -u postgres createdb ceramic_erp_prod

# Create database user
sudo -u postgres psql -c "CREATE USER erp_user WITH PASSWORD 'strong_password_here';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE ceramic_erp_prod TO erp_user;"

# Import schema
sudo -u postgres psql -d ceramic_erp_prod -f /path/to/schema.sql
```

#### 3. Backend Deployment

```bash
# Clone/copy project files
cd /var/www/
git clone <your-repo> ceramic-erp

# Install dependencies
cd ceramic-erp/backend
npm install --production

# Create production .env
cat > .env << EOF
PORT=5000
NODE_ENV=production
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ceramic_erp_prod
DB_USER=erp_user
DB_PASSWORD=strong_password_here
JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRES_IN=24h
EOF

# Start with PM2
pm2 start src/server.js --name ceramic-erp-api
pm2 save
pm2 startup
```

#### 4. Frontend Deployment

```bash
# Build frontend
cd /var/www/ceramic-erp/frontend
npm install
npm run build

# Start with PM2
pm2 start npm --name ceramic-erp-web -- start
pm2 save
```

#### 5. Nginx Configuration

```nginx
# /etc/nginx/sites-available/ceramic-erp

# Backend API
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

# Frontend
server {
    listen 80;
    server_name erp.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/ceramic-erp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# Install SSL with Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.yourdomain.com -d erp.yourdomain.com
```

### Option 2: Docker Deployment

#### 1. Create Dockerfiles

**Backend Dockerfile:**
```dockerfile
# backend/Dockerfile
FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 5000

CMD ["node", "src/server.js"]
```

**Frontend Dockerfile:**
```dockerfile
# frontend/Dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine

WORKDIR /app

COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3000

CMD ["npm", "start"]
```

#### 2. Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  postgres:
    image: postgres:14-alpine
    environment:
      POSTGRES_DB: ceramic_erp
      POSTGRES_USER: erp_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./backend/schema.sql:/docker-entrypoint-initdb.d/schema.sql
    ports:
      - "5432:5432"
    restart: unless-stopped

  backend:
    build: ./backend
    environment:
      NODE_ENV: production
      PORT: 5000
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: ceramic_erp
      DB_USER: erp_user
      DB_PASSWORD: ${DB_PASSWORD}
      JWT_SECRET: ${JWT_SECRET}
    ports:
      - "5000:5000"
    depends_on:
      - postgres
    restart: unless-stopped

  frontend:
    build: ./frontend
    environment:
      NEXT_PUBLIC_API_URL: https://api.yourdomain.com/api/v1
    ports:
      - "3000:3000"
    depends_on:
      - backend
    restart: unless-stopped

volumes:
  postgres_data:
```

```bash
# Deploy with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Option 3: Cloud Platform Deployment

#### Vercel (Frontend) + Railway (Backend + Database)

**Frontend on Vercel:**
1. Push code to GitHub
2. Import project to Vercel
3. Set environment variable: `NEXT_PUBLIC_API_URL`
4. Deploy automatically

**Backend on Railway:**
1. Create new project on Railway
2. Add PostgreSQL database
3. Add Node.js service
4. Set environment variables
5. Deploy from GitHub

#### AWS Deployment

- **EC2:** For application servers
- **RDS:** For PostgreSQL database
- **S3:** For file uploads
- **CloudFront:** For CDN
- **Route 53:** For DNS
- **ELB:** For load balancing

## Post-Deployment Tasks

### 1. Security Hardening

```bash
# Configure firewall
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# Secure PostgreSQL
sudo nano /etc/postgresql/14/main/pg_hba.conf
# Change peer to md5 for local connections

# Set up fail2ban
sudo apt install fail2ban
sudo systemctl enable fail2ban
```

### 2. Database Backups

```bash
# Create backup script
cat > /usr/local/bin/backup-erp-db.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/var/backups/ceramic-erp"
DATE=$(date +%Y%m%d_%H%M%S)
mkdir -p $BACKUP_DIR

pg_dump -U erp_user ceramic_erp_prod | gzip > $BACKUP_DIR/backup_$DATE.sql.gz

# Keep only last 7 days
find $BACKUP_DIR -name "backup_*.sql.gz" -mtime +7 -delete
EOF

chmod +x /usr/local/bin/backup-erp-db.sh

# Schedule daily backups
sudo crontab -e
# Add: 0 2 * * * /usr/local/bin/backup-erp-db.sh
```

### 3. Monitoring Setup

```bash
# Install monitoring tools
pm2 install pm2-logrotate

# Set up health checks
pm2 start ecosystem.config.js

# Configure alerts (example with PM2)
pm2 set pm2:autodump true
pm2 set pm2:watch true
```

### 4. Change Default Credentials

```sql
-- Connect to database
psql -U erp_user -d ceramic_erp_prod

-- Update admin password
UPDATE Users 
SET PasswordHash = crypt('new_secure_password', gen_salt('bf')) 
WHERE Username = 'admin';
```

## Maintenance

### Regular Tasks

**Daily:**
- Check application logs
- Monitor database performance
- Review error rates

**Weekly:**
- Verify backups are working
- Check disk space
- Review security logs

**Monthly:**
- Update dependencies
- Review and optimize database
- Test backup restoration

### Updating the Application

```bash
# Pull latest code
cd /var/www/ceramic-erp
git pull origin main

# Update backend
cd backend
npm install
pm2 restart ceramic-erp-api

# Update frontend
cd ../frontend
npm install
npm run build
pm2 restart ceramic-erp-web
```

### Database Migrations

```bash
# Create migration file
cat > migrations/001_add_new_field.sql << 'EOF'
ALTER TABLE Products ADD COLUMN NewField VARCHAR(100);
EOF

# Apply migration
psql -U erp_user -d ceramic_erp_prod -f migrations/001_add_new_field.sql
```

## Troubleshooting

### Application Won't Start

```bash
# Check logs
pm2 logs ceramic-erp-api
pm2 logs ceramic-erp-web

# Check process status
pm2 status

# Restart services
pm2 restart all
```

### Database Connection Issues

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check connections
sudo -u postgres psql -c "SELECT * FROM pg_stat_activity;"

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### High Memory Usage

```bash
# Check memory usage
free -h
pm2 monit

# Restart services if needed
pm2 restart all
```

## Rollback Procedure

```bash
# Stop current version
pm2 stop all

# Restore previous version
git checkout <previous-commit>
cd backend && npm install
cd ../frontend && npm install && npm run build

# Restore database backup if needed
gunzip < /var/backups/ceramic-erp/backup_YYYYMMDD.sql.gz | psql -U erp_user ceramic_erp_prod

# Start services
pm2 start all
```

## Performance Optimization

### Database Optimization

```sql
-- Create indexes
CREATE INDEX idx_orders_customer_date ON Orders(CustomerID, OrderDate);
CREATE INDEX idx_orderitems_product ON OrderItems(ProductID);

-- Analyze tables
ANALYZE Orders;
ANALYZE OrderItems;
ANALYZE CustomerProductPrices;

-- Vacuum database
VACUUM ANALYZE;
```

### Application Caching

Consider implementing:
- Redis for session storage
- CDN for static assets
- Database query caching
- API response caching

## Support and Monitoring

### Recommended Monitoring Tools

- **Application:** PM2, New Relic, Datadog
- **Database:** pgAdmin, PostgreSQL logs
- **Server:** Netdata, Prometheus + Grafana
- **Uptime:** UptimeRobot, Pingdom

### Log Management

```bash
# Configure log rotation
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

## Conclusion

This deployment guide provides multiple options for deploying the Ceramic & Tiles ERP system. Choose the option that best fits your infrastructure and requirements. Always test deployments in a staging environment before going to production.

