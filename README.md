# Auto Service Appointment System

A web-based automotive service appointment and workshop management system developed for a real automotive service business.

The application allows customers to schedule service appointments online while providing administrators with tools to manage appointments, service availability, vehicle-specific operations and workshop capacity.

## Overview

The system was designed for **Saygılı Ford**, an automotive repair and maintenance workshop.

Customers can create appointments without creating an account. Available appointment times are calculated dynamically according to workshop capacity, service duration, vehicle model and existing reservations.

Administrators have a protected management panel where appointments, service configurations and workshop settings can be managed.

## Key Features

### Customer

- Online appointment creation
- No customer account required
- Ford model selection
- Vehicle year, mileage, fuel type and license plate information
- Service selection based on vehicle model
- Dynamic appointment availability
- Past dates and unavailable time slots automatically disabled
- Workshop capacity control
- Appointment notes
- Responsive interface for desktop and mobile devices

### Administrator

- Firebase Authentication based admin login
- Appointment management dashboard
- Appointment status management
- Service activation and deactivation
- Vehicle-model-specific service configuration
- Configurable service durations
- Workshop resource and capacity management
- Working day and schedule configuration
- Customer appointment overview

## Scheduling System

The scheduling engine prevents overlapping reservations by dividing service durations into reservation units.

Available appointment times are calculated using:

- Selected vehicle model
- Selected service
- Service duration
- Workshop working hours
- Existing reservations
- Available workshop resources

The system prevents multiple appointments from occupying the same workshop resource at the same time.

## Technologies

- React
- Vite
- JavaScript
- Firebase Authentication
- Cloud Firestore
- Firebase Hosting
- HTML
- CSS
- Playwright
- ESLint

## Project Structure

```text
auto-service-appointment-system
├── public
├── src
│   ├── components
│   ├── config
│   ├── pages
│   ├── services
│   └── utils
├── tests
│   ├── e2e
│   └── security
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── playwright.config.js
├── vite.config.js
└── package.json
```

## Firebase Architecture

The application uses Firebase for backend services.

### Firebase Authentication

Administrator access is protected using Firebase Authentication.

### Cloud Firestore

Firestore stores application data such as:

- Appointments
- Reservation units
- Service planning
- Workshop settings
- Administrator authorization records

Firestore Security Rules separate customer and administrator permissions.

Customers can create validated appointments but cannot read customer appointment records.

Administrative operations require an authenticated and authorized administrator account.

## Security

The project includes Firestore Security Rules designed to enforce:

- Administrator-only appointment access
- Administrator-only configuration changes
- Validated customer appointment creation
- Restricted document updates
- Protected administrator records
- Server-generated timestamps
- Reservation and capacity validation

Sensitive local environment files are excluded from version control.

## Environment Configuration

Create a `.env.local` file based on `.env.example`.

```env
VITE_FIREBASE_API_KEY=YOUR_API_KEY
VITE_FIREBASE_AUTH_DOMAIN=YOUR_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET=YOUR_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID=YOUR_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID=YOUR_APP_ID
```

The `.env.local` file must not be committed to Git.

## Installation

Install project dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Create a production build:

```bash
npm run build
```

## Testing

The project includes automated tests implemented with Playwright.

Test coverage includes:

- Customer booking flow
- Form validation
- Admin authentication
- Admin settings interface
- Scheduling logic
- Date and time logic
- Responsive user interface
- Firebase security checks
- Live end-to-end appointment flow

Run the Playwright test suite with:

```bash
npx playwright test
```

Additional testing information is available in:

**[TEST_REHBERI.md](TEST_REHBERI.md)**

## Deployment

The application supports deployment with Firebase Hosting.

Build the project:

```bash
npm run build
```

Then deploy using the Firebase CLI:

```bash
firebase deploy
```

## Purpose

This project demonstrates the development of a real-world appointment management system with:

- Dynamic scheduling
- Cloud database integration
- Authentication and authorization
- Firestore security rules
- Responsive frontend development
- Automated end-to-end testing
- Real-world business workflow modeling

## Developer

**Semih Can Kasar**
