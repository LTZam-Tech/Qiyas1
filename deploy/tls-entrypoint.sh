#!/bin/sh
# Uses the client's certificate from /etc/nginx/certs (fullchain.pem + privkey.pem).
# Without one, makes a temporary self-signed certificate so the site still starts;
# browsers will warn until the real certificate is installed.
set -e
mkdir -p /etc/nginx/tls
if [ -s /etc/nginx/certs/fullchain.pem ] && [ -s /etc/nginx/certs/privkey.pem ]; then
  cp /etc/nginx/certs/fullchain.pem /etc/nginx/tls/fullchain.pem
  cp /etc/nginx/certs/privkey.pem /etc/nginx/tls/privkey.pem
  echo "qiyas: using the installed certificate"
else
  echo "qiyas: WARNING no certificate in ./certs; using a temporary self-signed one"
  openssl req -x509 -nodes -newkey rsa:2048 -days 30 -subj "/CN=qiyas.local" \
    -keyout /etc/nginx/tls/privkey.pem -out /etc/nginx/tls/fullchain.pem >/dev/null 2>&1
fi
chmod 600 /etc/nginx/tls/privkey.pem
