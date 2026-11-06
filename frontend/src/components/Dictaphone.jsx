import React, { useEffect } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import { Mic, Square } from 'lucide-react';

const Dictaphone = ({ setInputValue, inputValue }) => {
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();

  // Update input value in real-time as the user speaks
  useEffect(() => {
    if (transcript) {
      setInputValue(transcript);  // Set input value with real-time speech text
    }
  }, [transcript, setInputValue]);

  // Manually reset the transcript when inputValue is cleared
  useEffect(() => {
    if (inputValue === "") {
      resetTranscript();  // Reset speech recognition when input is cleared
    }
  }, [inputValue, resetTranscript]);

  // Stop listening and clean up on unmount
  useEffect(() => {
    return () => {
      SpeechRecognition.stopListening();
      resetTranscript(); // Reset transcript on unmount
    };
  }, [resetTranscript]);

  // Toggle listening state
  const toggleListening = () => {
    if (listening) {
      SpeechRecognition.stopListening();  // Stop listening
    } else {
      resetTranscript();  // Reset the transcript before starting
      setInputValue("");  // Clear the input field
      SpeechRecognition.startListening({
        continuous: true,
        interimResults: true,
        language: 'en-IN',
      });  // Start fresh listening
    }
  };

  // If unsupported browser
  if (!browserSupportsSpeechRecognition) {
    return <span>Your browser does not support speech recognition.</span>;
  }

  return (
    <div className="flex items-center space-x-2">
      <button
        onClick={toggleListening}
        title={listening ? 'Stop voice input' : 'Start voice input'}
        className={`p-2 rounded-full transition-all shadow focus:outline-none ${
          listening ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-gray-100 text-gray-400 hover:bg-blue-100 hover:text-blue-800'
        }`}
      >
        {listening ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
      </button>
    </div>
  );
};

export default Dictaphone;
