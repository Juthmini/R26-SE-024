import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PatientRegistration from './pages/PatientRegistration';
import PatientBulkUpload from './pages/PatientBulkUpload';
import PatientList from './pages/PatientList';
import BehavioralPatterns from './pages/BehavioralPatterns';
import ObjectTracker from './pages/ObjectTracker';
import PersonalizedObjectUpload from './pages/PersonalizedObjectUpload';
import PersonalizedAnalytics from './pages/PersonalizedAnalytics';
import BehaviorAnomalyReports from './pages/BehaviorAnomalyReports';
import GeofenceSettings from './pages/GeofenceSettings';
import MemoryReport from './pages/MemoryReport';
import Layout from './components/Layout';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* Protected Admin Routes */}
        <Route path="/admin" element={<Layout />}>
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="registration" element={<PatientRegistration />} />
          <Route path="edit/:id" element={<PatientRegistration />} />
          <Route path="list" element={<PatientList />} />
          <Route path="behavior" element={<BehavioralPatterns />} />
          <Route path="tracker" element={<ObjectTracker />} />
          <Route path="personal-vault" element={<PersonalizedObjectUpload />} />
          <Route path="intelligence" element={<PersonalizedAnalytics />} />
          <Route path="anomaly-reports" element={<BehaviorAnomalyReports />} />
          <Route path="geofence" element={<GeofenceSettings />} />
          <Route path="bulk-upload" element={<PatientBulkUpload />} />
          <Route path="memory-report" element={<MemoryReport />} />
        </Route>

        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
