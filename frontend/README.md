# Abbsey Admin — Hotel & Gym Business Frontend

This is the Next.js 14 (App Router) admin panel for the Fitness Gym and the Apartments.

## Quick start

1. Install dependencies
   ```bash
   cd frontend
   npm install
   ```

2. Configure environment
   - `.env.local` is provided with `NEXT_PUBLIC_API_URL=http://localhost:5000/api`

3. Run the development server
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

4. Build for production
   ```bash
   npm run build
   ```

5. Start production build
   ```bash
   npm start
   ```

## Notes
- The app expects the backend to be running at `http://localhost:5000/api`.
- Tokens are stored in `localStorage` under the `token` key.
- The sidebar switches between the two businesses: "Fitness Gym" (`/dashboard`) and "Apartments" (`/residences`).
- Demo login accepts any credentials as long as the backend responds; the UI uses the contract as documented.
