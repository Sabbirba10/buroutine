# BRACU Routine Live Relay

A live relay UI for BRAC University course schedules, seat status, and more. This project provides a web interface to view, search, and interact with course routines for different semesters, including live seat updates and calendar export features.

## Features

- Live seat status and class schedules for BRACU courses
- Search by course code or faculty initials
- Semester-specific views (Spring, Summer, etc.)
- Export schedules to Google Calendar, Outlook, Apple Calendar (.ics)
- Responsive design with Tailwind CSS

## Project Structure

```
public/
  index.html
  index.js
  indexConnect.js
  search.js
  css/
    style.css
  sp25/
    ...
  sum25/
    ...
  calender/
    ...
src/
  styles.css
firebase.json
tailwind.config.js
package.json
```

## Getting Started

1. **Clone the repository:**

   ```sh
   git clone https://github.com/Sabbirba10/routine.git
   cd your-repo
   ```

2. **Install dependencies:**

   ```sh
   npm install
   ```

3. **Build Tailwind CSS (if needed):**

   ```sh
   npx tailwindcss -i ./src/styles.css -o ./public/css/style.css --watch
   ```

4. **Run locally:**
   Open `public/index.html` or any semester-specific HTML file in your browser.

## Deployment

This project uses Firebase Hosting. To deploy:

```sh
firebase deploy
```

## License

MIT

---

**Note:** This project is not affiliated with BRAC University. Data is relayed from public sources for convenience.
