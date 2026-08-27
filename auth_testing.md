# Auth Testing Playbook

Credentials live in /app/memory/test_credentials.md.

1. Mongo: `mongosh` -> use test_database -> db.users.find({role:"admin"}) — bcrypt hash starts with $2b$.
2. Login:
   curl -c cookies.txt -X POST $API/api/auth/login -H "Content-Type: application/json" -d '{"email":"demo@vqt.gg","password":"demo12345"}'
3. Session: curl -b cookies.txt $API/api/auth/me
4. Protected flow: register -> PATCH /api/users/me -> POST /api/licenses/purchase {"plan":"30d"} -> GET /api/licenses/my -> GET /api/download/client
