export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            AI Disaster Response Orchestrator
          </h1>
          <p className="text-xl text-gray-600">
            Intelligent multi-step disaster response coordination system
          </p>
        </header>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">
              System Status
            </h2>
            <div className="space-y-3">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded-full mr-3"></div>
                <span>Frontend: Online</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-yellow-500 rounded-full mr-3"></div>
                <span>Backend: Connecting...</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-yellow-500 rounded-full mr-3"></div>
                <span>TiDB: Pending Setup</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">
              Day 1 Progress
            </h2>
            <p className="text-gray-600 mb-4">
              Frontend dashboard scaffolded with Next.js and Tailwind CSS.
              Ready for disaster incident visualization and management.
            </p>
            <div className="text-sm text-gray-500">
              Next: Backend API and TiDB integration
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
