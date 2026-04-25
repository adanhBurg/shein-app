import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext.jsx';
import CustomerOrderPage from './pages/CustomerOrderPage.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import OwnerSetup from './pages/OwnerSetup.jsx';
import SuperAdmin from './pages/SuperAdmin.jsx';
import Storefront from './pages/Storefront.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          {/* Public storefront */}
          <Route path="/" element={<Storefront />} />

          {/* Customer order form */}
          <Route path="/:store/orders" element={<CustomerOrderPage />} />
          <Route path="/store/:store/orders" element={<CustomerOrderPage />} />
          <Route path="/shein-order.html" element={<CustomerOrderPage />} />

          {/* Admin dashboard */}
          <Route path="/:store/admin" element={<AdminDashboard />} />
          <Route path="/store/:store/admin" element={<AdminDashboard />} />
          <Route path="/admin.html" element={<AdminDashboard />} />

          {/* Owner setup */}
          <Route path="/owner" element={<OwnerSetup />} />
          <Route path="/owner.html" element={<OwnerSetup />} />

          {/* Super admin */}
          <Route path="/super-admin" element={<SuperAdmin />} />
          <Route path="/super-admin.html" element={<SuperAdmin />} />

          {/* 404 */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}
