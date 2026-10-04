# Installation Guide

**Kuventory v2.0.0**

This guide provides instructions for setting up the Kuventory frontend application on your local machine for development.

## Prerequisites
1. **Node.js**: Version 18.x or higher is required.
2. **npm**: Included with Node.js.
3. **Git**: To clone the repository.

## Step-by-Step Setup

### 1. Clone the Repository
Open your terminal and clone the repository:
```bash
git clone https://github.com/noodlestack/KUVENTORY.git
cd KUVENTORY
```

### 2. Navigate to the Frontend Directory
All frontend code resides in the `frontend` directory:
```bash
cd frontend
```

### 3. Install Dependencies
Run npm install to fetch all required libraries:
```bash
npm install
```

### 4. Configure Environment Variables
Copy the example environment file to create your local configuration:
```bash
cp .env.example .env.local
```
If `.env.example` does not exist, create a `.env.local` file with the following contents:
```env
VITE_API_URL=http://localhost:8000/api
VITE_APP_NAME="Kuventory"
VITE_APP_VERSION="v2.0.0"
VITE_ENABLE_DEVTOOLS=true
```

### 5. Start the Development Server
Launch the Vite development server:
```bash
npm run dev
```
The terminal will output the local URL (usually `http://localhost:5173/`). Open this URL in your browser.

## Troubleshooting
- **Port Conflicts**: If port 5173 is in use, Vite will automatically select the next available port. Check the terminal output for the correct URL.
- **Dependency Issues**: If you encounter errors relating to missing modules, delete the `node_modules` directory and `package-lock.json`, then re-run `npm install`.
