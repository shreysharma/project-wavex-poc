'use client';

import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useAppContext, LANGUAGES } from '@/contexts/AppContext';

const Navbar = () => {
  const {
    isConnected,
    connectedSTTCount,
    totalSTTCount,
    selectedLanguage,
    isDropdownOpen,
    setIsDropdownOpen,
    isOneShotMode,
    setIsOneShotMode,
    handleLanguageSelect,
    clearAllQueues,
    setTranslationResults,
    setInputText,
    setSelectedAudioFile,
    setSelectedVideoFile,
    setIsTranslating,
    setIsWaitingForAudioChunks,
  } = useAppContext();

  return (
    <nav className="fixed top-14 w-full px-6 py-4 my-4 flex justify-between items-center bg-white shadow-sm rounded-lg z-40">
      <div className="flex gap-4 items-center">
        <h1 className="text-2xl text-gray-800">Continuous STT Test</h1>

        <div className={`
          px-3 py-1 rounded-full text-sm font-medium transition-colors
          ${isConnected
            ? 'bg-green-100 text-green-700'
            : connectedSTTCount > 0
            ? 'bg-yellow-100 text-yellow-700'
            : 'bg-gray-100 text-gray-700'
          }
        `}>
          {isConnected
            ? `STT: Connected (${connectedSTTCount}/${totalSTTCount})`
            : connectedSTTCount > 0
            ? `STT: Connecting (${connectedSTTCount}/${totalSTTCount})`
            : 'STT: API Mode'
          }
        </div>
      </div>

      <div className="flex items-center gap-6">
        {/* Language Selector */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Language:</label>
          <div className="relative">
            <button
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              className="
                bg-white border border-gray-300 rounded-lg px-4 py-2 text-sm
                flex items-center gap-2 hover:border-blue-500 focus:border-blue-500
                focus:ring-2 focus:ring-blue-200 transition-all min-w-[160px]
              "
            >
              <span>{selectedLanguage.name} ({selectedLanguage.nativeName})</span>
              <ChevronDownIcon
                className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isDropdownOpen && (
              <div className="
                absolute top-full left-0 mt-1 bg-white border border-gray-200
                rounded-lg shadow-lg z-50 min-w-[200px] max-h-64 overflow-y-auto
              ">
                <div className="py-1">
                  {LANGUAGES.map((language) => (
                    <button
                      key={language.code}
                      onClick={() => handleLanguageSelect(language)}
                      className="
                        w-full px-4 py-2 text-left text-sm hover:bg-gray-100
                        focus:bg-gray-100 transition-colors
                      "
                    >
                      {language.name} ({language.nativeName})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* One Shot Toggle */}
        <div className="flex items-center gap-3">
          <span className={`text-sm font-medium transition-colors ${isOneShotMode ? 'text-blue-600' : 'text-gray-700'}`}>
            One Shot
          </span>
          <button
            onClick={() => {
              const newMode = !isOneShotMode;
              setIsOneShotMode(newMode);
              console.log(newMode ? 'One Shot mode enabled' : 'One Shot mode disabled');
              
              // Clear everything when switching to one shot mode
              if (newMode) {
                console.log('Clearing all data for One Shot mode...');
                clearAllQueues();
                setTranslationResults([]);
                setInputText('');
                setSelectedAudioFile(null);
                setSelectedVideoFile(null);
                setIsTranslating(false);
                setIsWaitingForAudioChunks(false);
                console.log('✅ Cleared all data and processing states for One Shot mode');
              }
            }}
            className={`
              relative inline-flex h-6 w-11 items-center rounded-full transition-colors
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              ${isOneShotMode ? 'bg-blue-600' : 'bg-gray-300'}
            `}
            role="switch"
            aria-checked={isOneShotMode}
            aria-label="Toggle one shot mode"
          >
            <span
              className={`
                inline-block h-4 w-4 transform rounded-full bg-white shadow-lg
                transition-transform duration-200
                ${isOneShotMode ? 'translate-x-6' : 'translate-x-1'}
              `}
            />
          </button>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;