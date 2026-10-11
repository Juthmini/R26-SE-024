import React from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { 
  LayoutDashboard, 
  UserPlus, 
  FileSpreadsheet,
  Settings, 
  LogOut, 
  HeartPulse,
  Users,
  Activity,
  MapPin,
  Box,
  TrendingUp,
  Brain
} from 'lucide-react';

const Layout = () => {
  const navigate = useNavigate();

  const menuItems = [
    { name: 'Dashboard', path: '/admin/dashboard', icon: LayoutDashboard },
    { name: 'Patient Registration', path: '/admin/registration', icon: UserPlus },
    { name: 'Patient Registry', path: '/admin/list', icon: Users },
    { name: 'Behavior Logs', path: '/admin/behavior', icon: Activity },
    { name: 'Object Tracker', path: '/admin/tracker', icon: MapPin },
    { name: 'Personal Vault', path: '/admin/personal-vault', icon: Box },
    { name: 'Reports and Analytics', path: '/admin/intelligence', icon: TrendingUp },
    { name: 'Anomaly Reports', path: '/admin/anomaly-reports', icon: Activity },
    { name: 'Memory Report', path: '/admin/memory-report', icon: Brain },
    { name: 'Geofence Rules', path: '/admin/geofence', icon: MapPin },
    { name: 'Data Ingestion', path: '/admin/bulk-upload', icon: FileSpreadsheet },
    { name: 'System Settings', path: '/admin/settings', icon: Settings },
  ];

  return (
    <div className="flex h-screen bg-slate-50 print:block print:h-auto print:bg-white">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col print:hidden">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
            <HeartPulse className="text-white w-6 h-6" />
          </div>
          <span className="text-xl font-bold text-slate-800 tracking-tight">MemoCare</span>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {menuItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium
                ${isActive 
                  ? 'bg-blue-50 text-blue-600 shadow-sm shadow-blue-100' 
                  : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'}
              `}
            >
              <item.icon size={20} />
              {item.name}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button 
            onClick={() => navigate('/login')}
            className="flex items-center gap-3 w-full px-4 py-3 text-red-500 hover:bg-red-50 rounded-xl transition-all font-semibold"
          >
            <LogOut size={20} />
            Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden print:overflow-visible">
        {/* Header */}
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm z-10 print:hidden">
          <div>
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Admin Control</h2>
            <p className="text-slate-700 font-semibold">Welcome back, Administrator</p>
          </div>
          <div className="flex items-center gap-4">
             <div className="text-right mr-2">
               <p className="text-sm font-bold text-slate-800">Administrator ERP</p>
               <p className="text-xs text-blue-600 font-bold">Admin</p>
             </div>
             <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center border-2 border-slate-200 overflow-hidden">
                <Users className="text-slate-400 w-6 h-6" />
             </div>
          </div>
        </header>

        {/* Page Area */}
        <main className="flex-1 overflow-y-auto p-8 print:overflow-visible print:p-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default Layout;
