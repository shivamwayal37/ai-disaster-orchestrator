import DashboardLayout from '@/components/DashboardLayout'

async function getInitialAlerts() {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001'}/api/incidents`, {
      cache: 'no-store', // Always get fresh data
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    if (!res.ok) {
      console.error('Failed to fetch initial alerts:', res.statusText);
      return { data: [] };
    }
    
    return await res.json();
  } catch (error) {
    console.error('Error fetching initial alerts:', error);
    return { data: [] };
  }
}

export default async function Page({ searchParams }) {
  const initialAlerts = await getInitialAlerts();
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -inset-10 opacity-30">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-disaster-red rounded-full mix-blend-multiply filter blur-xl animate-pulse"></div>
          <div className="absolute top-3/4 right-1/4 w-96 h-96 bg-disaster-orange rounded-full mix-blend-multiply filter blur-xl animate-pulse delay-75"></div>
          <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-disaster-blue rounded-full mix-blend-multiply filter blur-xl animate-pulse delay-150"></div>
        </div>
      </div>
      
      <DashboardLayout initialAlerts={initialAlerts.data} searchParams={searchParams} />
    </div>
  );
}

