'use client';

import { useAppContext } from '@/contexts/AppContext';

const SkipConnectionButton = () => {
  const { setIsConnected } = useAppContext();

  return (
    <div className="mt-6 pt-4 border-t border-gray-200 text-center">
      <button
        onClick={() => setIsConnected(true)}
        className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        Skip and continue in API-only mode
      </button>
    </div>
  );
};

const ConnectionOverlay = () => {
  const { isConnected, connectedSTTCount, totalSTTCount } = useAppContext();

  // Don't show overlay if fully connected
  if (isConnected) {
    return null;
  }

  const connectionProgress = totalSTTCount > 0 ? (connectedSTTCount / totalSTTCount) * 100 : 0;

  const targetLanguages = [
    { code: 'hi', name: 'Hindi', nativeName: 'हिंदी' },
    { code: 'en', name: 'English', nativeName: 'English' },
    { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
    { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
    { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
    { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
    { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
    { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
    { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
    { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
    { code: 'ur', name: 'Urdu', nativeName: 'اردو' },
    { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ' },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl p-8 max-w-2xl mx-4 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-300">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-[#3840EB] rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M8 12L10.5 14.5L16 9" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx="12" cy="12" r="10" stroke="white" strokeWidth="2"/>
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-gray-800 mb-2">Establishing STT Connections</h2>
          <p className="text-gray-600">Connecting to speech-to-text services for real-time translation</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Connection Progress</span>
            <span>{connectedSTTCount}/{totalSTTCount} Connected</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div
              className="bg-[#3840EB] h-3 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${connectionProgress}%` }}
            />
          </div>
          <div className="text-center text-sm text-gray-500 mt-2">
            {connectionProgress.toFixed(0)}% Complete
          </div>
        </div>

        {/* Language Connection Status Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
          {targetLanguages.slice(0, totalSTTCount).map((lang, index) => {
            const isConnected = index < connectedSTTCount;

            return (
              <div
                key={lang.code}
                className={`
                  flex items-center gap-2 p-2 rounded-lg text-sm transition-all duration-300
                  ${isConnected
                    ? 'bg-green-50 border border-green-200'
                    : index === connectedSTTCount
                    ? 'bg-yellow-50 border border-yellow-200 animate-pulse'
                    : 'bg-gray-50 border border-gray-200'
                  }
                `}
              >
                <div className={`
                  w-3 h-3 rounded-full transition-all duration-300
                  ${isConnected
                    ? 'bg-green-500'
                    : index === connectedSTTCount
                    ? 'bg-yellow-500 animate-ping'
                    : 'bg-gray-300'
                  }
                `} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">{lang.name}</p>
                  <p className="text-xs text-gray-500 truncate">{lang.nativeName}</p>
                </div>
                {isConnected && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M8 12L10.5 14.5L16 9" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
            );
          })}
        </div>

        {/* Connection Status */}
        <div className="text-center">
          {connectedSTTCount === 0 ? (
            <div className="text-gray-600">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#3840EB] mx-auto mb-2"></div>
              <p>Initializing STT connections...</p>
            </div>
          ) : connectedSTTCount < totalSTTCount ? (
            <div className="text-yellow-600">
              <div className="animate-pulse text-lg mb-1">●</div>
              <p>Connecting to remaining STT services...</p>
              <p className="text-sm text-gray-500 mt-1">
                {totalSTTCount - connectedSTTCount} connections remaining
              </p>
            </div>
          ) : (
            <div className="text-green-600">
              <div className="text-2xl mb-1">✓</div>
              <p>All STT connections established!</p>
              <p className="text-sm text-gray-500 mt-1">Ready for real-time translation</p>
            </div>
          )}
        </div>

        {/* Skip Option (for testing) */}
        <SkipConnectionButton />
      </div>
    </div>
  );
};

export default ConnectionOverlay;