# ReqLab – API Testing Workspace

A lightweight, browser-based API testing tool for sending HTTP requests, configuring request parameters, and inspecting API responses.

## 🚀 Features

- **HTTP Methods:** Send GET, POST, PUT, DELETE, and PATCH requests.
- **Flexible URL Input:** Enter a complete endpoint or build URLs using separate base URL and path fields.
- **Query Parameters:** Add, edit, and remove URL query parameters.
- **Authorization:** Support Bearer, Basic, and custom token formats.
- **Custom Headers:** Configure request headers using JSON.
- **Request Body:** Send JSON, plain text, HTML, XML, and URL-encoded form data.
- **Response Inspection:** View response status, headers, and formatted response bodies.
- **Performance Metrics:** Monitor response time and response size.
- **JSON Viewer:** Explore nested JSON responses through an expandable tree structure.
- **Google Sign-In:** Sign in with a Google account using Firebase Authentication.
- **Saved Requests:** Save requests to personal Firestore folders and load them later.
- **Private Libraries:** Firestore rules restrict each user's folders and requests to their account.

## 🛠️ Tech Stack

- Next.js 15
- React 19
- TypeScript
- Tailwind CSS 3
- Firebase Authentication and Cloud Firestore
- ESLint

## 📸 Screenshot

<img width="1920" height="1246" alt="image" src="https://github.com/user-attachments/assets/3a8e49b5-447f-4eff-bbc0-ad41d5e54ca2" />


## ⚙️ Getting Started

### Prerequisites

- Node.js 20 or later
- npm

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/saniulislam10/reqlab.git
   ```

2. Navigate to the project directory:

   ```bash
   cd reqlab
   ```

3. Install dependencies:

   ```bash
   npm install
   ```

4. Configure Firebase as described below, then start the development server:

   ```bash
   npm run dev
   ```

5. Open your browser and visit:

   ```text
   http://localhost:3000
   ```

### Firebase Setup

ReqLab uses Firebase Authentication for Google sign-in and Cloud Firestore for folders and saved requests.

1. Create a Firebase project and register a **Web app** in Project settings.
2. In **Authentication → Sign-in method**, enable **Google** and choose a support email.
3. In **Authentication → Settings → Authorized domains**, add `localhost` for local development and your deployed app's domain (for example, `reqlab.saniulislam.com`) when deploying.
4. Create a **Cloud Firestore** database.
5. In **Firestore Database → Rules**, publish the rules from [`firestore.rules`](firestore.rules). The rules only allow signed-in users to access their own data.
6. Copy `.env.example` to `.env.local` and replace the placeholders using the Firebase Web app configuration from **Project settings → General → Your apps**:

   ```text
   NEXT_PUBLIC_FIREBASE_API_KEY=
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=
   NEXT_PUBLIC_FIREBASE_APP_ID=
   ```

7. Restart the development server after changing environment variables. Add the same values to your hosting provider's environment settings for production.

The Firebase Web app configuration is used by the browser SDK. Firestore security rules protect stored data; never make the database publicly readable or writable. ReqLab does not save the authorization token entered in the request form. Credential-like headers and query parameters are omitted when saving, but review request bodies before saving if they contain secrets. Do not commit `.env.local` or share OAuth client secrets.

## 🌐 Live Demo

https://reqlab.saniulislam.com

## 👨‍💻 Developer

**Saniul Islam**  
Full Stack Developer

- Portfolio: [saniulislam.com](https://saniulislam.com)
- GitHub: [@saniulislam10](https://github.com/saniulislam10)
- LinkedIn: [linkedin.com/in/sani10](https://www.linkedin.com/in/sani10/)

---

Built with ❤️ by Saniul Islam.
