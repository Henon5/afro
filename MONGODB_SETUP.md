# MongoDB Atlas Configuration Guide

## Current Status
The `.env` file has been updated with the MongoDB Atlas connection string format.

## Required Action
You need to replace `<db_password>` in the `.env` file with your actual MongoDB Atlas password.

## Steps to Get Your MongoDB Password:

1. **Go to MongoDB Atlas**: https://mongodb.com/cloud/atlas
2. **Log in** to your account
3. **Navigate to Database Access** (left sidebar)
4. **Find your user**: `henokkifle_db_user`
5. **Edit User** or **Change Password** if needed
6. **Copy the password** (or set a new one)

## Update Your .env File

Open `/workspace/.env` and replace this line:
```
MONGODB_URI=mongodb+srv://henokkifle_db_user:<db_password>@cluster0.enemcot.mongodb.net/afro-bingo?retryWrites=true&w=majority
```

With your actual password (URL-encoded if it contains special characters):
```
MONGODB_URI=mongodb+srv://henokkifle_db_user:YourActualPassword123@cluster0.enemcot.mongodb.net/afro-bingo?retryWrites=true&w=majority
```

## Important Notes:

- **URL Encoding**: If your password contains special characters (@, :, /, etc.), you must URL-encode them
  - Example: `p@ss:word` becomes `p%40ss%3Aword`
  
- **Security**: Never commit your `.env` file to Git (it's already in .gitignore)

- **Test Connection**: After updating, restart your server:
  ```bash
  npm start
  ```
  
  You should see: `✅ [DB] MongoDB Connected: cluster0.enemcot.mongodb.net`

## Troubleshooting

If you still can't connect:
1. Check **Network Access** in MongoDB Atlas (IP Whitelist)
2. Add `0.0.0.0/0` to allow all IPs (for testing) or add your specific IP
3. Verify the username is correct: `henokkifle_db_user`
4. Ensure the database name `afro-bingo` exists or will be created on first write
