FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9
WORKDIR /scanner
COPY server.mjs archive.mjs ./
USER node
ENV LISTEN_HOST=0.0.0.0 PORT=8080
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=20s --start-period=120s CMD node -e "const b='Papperly readiness',c=require('node:crypto').createHash('sha256').update(b).digest('hex');fetch('http://127.0.0.1:8080/scan',{method:'POST',headers:{Authorization:'Bearer '+process.env.SCANNER_API_KEY,'Content-Type':'application/octet-stream','X-SHA256':c},body:b}).then(async r=>{if(!r.ok||(await r.json()).verdict!=='clean')process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "server.mjs"]
