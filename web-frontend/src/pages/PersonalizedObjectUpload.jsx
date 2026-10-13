import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Package, Upload, Search, User, CheckCircle2, Box, Sparkles, Loader2, Trash2, Gauge, Camera } from 'lucide-react';
import axios from 'axios';
import { io } from 'socket.io-client';
import Webcam from 'react-webcam';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// Fixed common-item list: these are what the Find My Things YOLO-World model is
// configured to recognize out of the box. Picking from here means no typing and
// a name that matches exactly what the scan step searches for. "Other" still
// allows a one-off custom item outside this list.
const COMMON_ITEMS = ['Glasses', 'Wallet', 'Pill Box', 'Hearing Aid Case', 'Keys', 'TV Remote'];
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:5000';
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

const ObjectCard = ({ name, image, labels, onDelete }) => {
  const imgSrc = image
    ? (image.startsWith('http') ? image : `${BACKEND_URL}${image}`)
    : null;

  return (
    <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm hover:shadow-xl transition-all group relative overflow-hidden">
      <div className="aspect-square bg-slate-50 rounded-2xl mb-3 overflow-hidden flex items-center justify-center">
        {imgSrc ? (
          <img
            src={imgSrc}
            alt={name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
            onError={(e) => { e.target.style.display='none'; e.target.nextSibling.style.display='flex'; }}
          />
        ) : null}
        <div className="hidden w-full h-full items-center justify-center text-slate-300 text-xs font-bold">No Image</div>
      </div>
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <h5 className="font-bold text-slate-800 text-sm truncate pr-2 capitalize">{name}</h5>
          <button onClick={onDelete} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
            <Trash2 size={16} />
          </button>
        </div>
        {labels && labels.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {labels.map((label, idx) => (
              <span key={idx} className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tighter">
                {label}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const PersonalizedObjectUpload = () => {
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [objects, setObjects] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [trainingStatus, setTrainingStatus] = useState('idle');
  const [progress, setProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('object');
  const [customName, setCustomName] = useState('');
  const [relationship, setRelationship] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [showWebcam, setShowWebcam] = useState(false);
  const [useOtherItem, setUseOtherItem] = useState(false);

  useEffect(() => {
    fetchPatients();

    const socket = io(SOCKET_URL);
    socket.on('training_progress', (data) => {
      if (data.patientId === selectedPatient?._id) {
        setProgress(data.percentage);
        if (data.percentage >= 100) {
          setTrainingStatus('ready');
          setUploading(false);
        }
      }
    });

    return () => socket.disconnect();
  }, [selectedPatient]);

  const fetchPatients = async () => {
    try {
      const res = await axios.get(`${API_URL}/admin/patients`);
      setPatients(res.data.data || []);
    } catch (err) {
      console.error("Failed to fetch patients", err);
    }
  };

  const filteredPatients = patients.filter(p => 
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.customerCode?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handlePatientSelect = async (patient) => {
    setIsVerifying(true);
    setObjects([]);
    setTimeout(async () => {
      setSelectedPatient(patient);
      setProgress(0);
      setTrainingStatus('idle');
      setIsVerifying(false);
      setUseOtherItem(false);
      setCustomName('');

      // Load existing saved objects for this patient
      try {
        const res = await axios.get(`${API_URL}/admin/personal-objects/patient/${patient._id}`);
        if (res.data.success && res.data.data.length > 0) {
          const loaded = res.data.data.map(obj => ({
            id: obj._id,
            name: obj.objectName,
            image: obj.imageUrl,
            labels: obj.detectedLabels || [],
            metadata: obj.detections || []
          }));
          setObjects(loaded);
          setTrainingStatus('ready');
        }
      } catch (err) {
        console.error('Failed to load patient objects', err);
      }
    }, 1000);
  };

  const processFiles = async (files) => {
    if (!selectedPatient) return;
    
    if (activeTab === 'person' && (!customName || !relationship)) {
      alert("Please enter the Person's Name and Relationship before uploading!");
      return;
    }
    if (activeTab === 'object' && !customName) {
      alert("Camera Upload Error: Please enter the Object Name before capturing!");
      return;
    }

    setUploading(true);
    
    for (const file of files) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('patientId', selectedPatient._id);
      formData.append('objectName', customName || (file.name ? file.name.split('.')[0] : 'captured'));
      formData.append('itemType', activeTab);
      if (activeTab === 'person') formData.append('relationship', relationship);

      try {
        const res = await axios.post(`${API_URL}/admin/personal-objects/upload`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
        
        if (res.data.success) {
          const detections = res.data.data.detections || [];
          const primaryName = customName || (detections.length > 0 ? detections[0].class_name : 'captured');
          setObjects(prev => [...prev, {
            id: res.data.data._id,
            name: primaryName,
            image: res.data.data.imageUrl,
            labels: detections.map(d => d.class_name),
            metadata: detections 
          }]);
          setCustomName('');
          setRelationship('');
        } else {
          alert(`Error: ${res.data.message}`);
        }
      } catch (err) {
        console.error("Upload failed", err);
        alert("Upload failed. Ensure backend AI service is running.");
      }
    }
    setUploading(false);
  };

  const handleFileUpload = (e) => {
    const files = Array.from(e.target.files);
    processFiles(files);
  };

  const webcamRef = useRef(null);
  const capture = useCallback(() => {
    const imageSrc = webcamRef.current.getScreenshot();
    if (imageSrc) {
      fetch(imageSrc)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], "webcam-capture.jpg", { type: "image/jpeg" });
          processFiles([file]);
          setShowWebcam(false);
        });
    }
  }, [webcamRef, activeTab, customName, relationship, selectedPatient]);

  const startTraining = async () => {
    if (!selectedPatient) return;
    setUploading(true);
    setTrainingStatus('training');
    setProgress(0);
    
    try {
      await axios.post(`${API_URL}/admin/train/${selectedPatient._id}`);
    } catch (err) {
      console.error("Training initiation failed", err);
      setTrainingStatus('idle');
      setUploading(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h2 className="text-4xl font-black text-slate-800 tracking-tight">Add Personal Item / Family Face</h2>
          <p className="text-slate-500 font-medium text-lg">Teach MemoCare to recognize unique objects and family members.</p>
          <div className="flex bg-slate-100 p-1 rounded-xl w-fit mt-4">
            <button onClick={() => setActiveTab("object")} className={`px-6 py-2 rounded-lg font-bold transition-all ${activeTab === "object" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}>Personal Items</button>
            <button onClick={() => setActiveTab("person")} className={`px-6 py-2 rounded-lg font-bold transition-all ${activeTab === "person" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500"}`}>Family Members (Faces)</button>
          </div>
        </div>
        <div className="flex items-center gap-3 bg-blue-50 px-6 py-3 rounded-2xl border border-blue-100">
          <Sparkles className="text-blue-600 w-5 h-5" />
          <span className="font-bold text-blue-700">AI Personalization: Active</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50">
            <h4 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <User size={20} className="text-blue-500" />
              1. Select Patient
            </h4>
            <div className="relative mb-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
              <input 
                placeholder="Search patient..."
                className="w-full bg-slate-50 border-none rounded-xl py-3 pl-10 pr-4 text-sm font-bold focus:ring-2 ring-blue-500/20 transition-all"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
              {filteredPatients.map(p => (
                <button 
                  key={p._id}
                  onClick={() => handlePatientSelect(p)}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${
                    selectedPatient?._id === p._id 
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' 
                    : 'hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black ${
                    selectedPatient?._id === p._id ? 'bg-white/20' : 'bg-slate-100'
                  }`}>
                    {p.firstName[0]}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-bold">{p.firstName} {p.lastName}</p>
                    <p className={`text-[10px] font-black uppercase opacity-60`}>{p.customerCode}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {!selectedPatient ? (
            <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-[3rem] h-[500px] flex flex-col items-center justify-center text-center p-12">
               <div className="w-20 h-20 bg-white rounded-3xl shadow-sm flex items-center justify-center mb-6">
                  <Box className="text-slate-300 w-10 h-10" />
               </div>
               <h3 className="text-xl font-bold text-slate-400 mb-2">No Patient Selected</h3>
               <p className="text-slate-400 max-w-xs font-medium">Please select a patient from the list to begin personalizing their essential objects.</p>
            </div>
          ) : (
            <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500">
              <div className="bg-white p-6 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-green-50 rounded-2xl flex items-center justify-center border border-green-100">
                    <CheckCircle2 className="text-green-500 w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-xl font-black text-slate-800">Verified: {selectedPatient.firstName}</h4>
                    <p className="text-sm text-slate-500 font-bold uppercase tracking-widest">ID: {selectedPatient.customerCode}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2 items-end">
                  {activeTab === 'person' ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Person's Name (e.g. Sarah)"
                        className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold w-48"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                      />
                      <input
                        type="text"
                        placeholder="Relationship (e.g. Daughter)"
                        className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold w-48"
                        value={relationship}
                        onChange={(e) => setRelationship(e.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="w-full max-w-md">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 text-right">Which item is this?</p>
                      <div className="flex flex-wrap gap-2 justify-end">
                        {COMMON_ITEMS.map(item => (
                          <button
                            key={item}
                            type="button"
                            onClick={() => { setUseOtherItem(false); setCustomName(item); }}
                            className={`px-4 py-2 rounded-xl text-xs font-black border transition-all ${
                              !useOtherItem && customName === item
                                ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200'
                                : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-blue-300'
                            }`}
                          >
                            {item}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => { setUseOtherItem(true); setCustomName(''); }}
                          className={`px-4 py-2 rounded-xl text-xs font-black border transition-all ${
                            useOtherItem
                              ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-blue-300'
                          }`}
                        >
                          Other
                        </button>
                      </div>
                      {useOtherItem && (
                        <input
                          type="text"
                          placeholder="Item name (e.g. Red Mug)"
                          className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-bold text-right"
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                          autoFocus
                        />
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-4">
                    <input type="file" id="object-upload" multiple className="hidden" onChange={handleFileUpload} />
                    <label htmlFor="object-upload" className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-2xl text-sm font-black hover:bg-blue-700 transition-all cursor-pointer shadow-lg shadow-blue-200">
                      <Upload size={18} />
                      {activeTab === 'person' ? 'Upload Face' : 'Upload Objects'}
                    </label>
                    <button onClick={() => setShowWebcam(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-2xl text-sm font-black hover:bg-indigo-700 transition-all cursor-pointer shadow-lg shadow-indigo-200">
                      <Camera size={18} />
                      Camera
                    </button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {objects.map((obj, i) => (
                  <ObjectCard 
                    key={i} 
                    name={obj.name} 
                    image={obj.image} 
                    labels={obj.labels}
                    onDelete={() => setObjects(objects.filter((_, idx) => idx !== i))}
                  />
                ))}
              </div>

              <div className="bg-slate-900 p-8 rounded-[3rem] shadow-2xl relative overflow-hidden group">
                 <div className="absolute inset-0 bg-blue-600/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                 <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="space-y-3 flex-1">
                       <h4 className="text-white text-2xl font-black">AI Personalization</h4>
                       {trainingStatus === 'training' && (
                         <div className="space-y-2 max-w-sm">
                           <div className="flex justify-between items-center text-[10px] font-black text-blue-400 uppercase tracking-widest">
                             <span>YOLO FINE-TUNING</span>
                             <span>{progress}%</span>
                           </div>
                           <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                             <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${progress}%` }} />
                           </div>
                         </div>
                       )}
                    </div>
                    <button onClick={startTraining} disabled={objects.length === 0 || uploading || trainingStatus === 'training'} className="bg-white text-slate-900 px-8 py-4 rounded-[1.2rem] font-black text-sm hover:bg-blue-600 hover:text-white transition-all shadow-2xl">
                      {trainingStatus === 'training' ? 'Training...' : trainingStatus === 'ready' ? 'Trained' : 'Start Training'}
                    </button>
                 </div>
              </div>

              {/* Data Summary Table */}
              {objects.length > 0 && (
                <div className="bg-white rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/30 overflow-hidden">
                  <div className="p-8 border-b border-slate-100">
                    <h4 className="text-xl font-black text-slate-800">Full Data Summary Table</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-50/50">
                        <tr>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">DataType</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Example/Result</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Confidence</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Class ID</th>
                          <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Class name</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {objects.map((obj) => (
                          obj.metadata?.map((det, idx) => (
                            <tr key={`${obj.id}-${idx}`}>
                              <td className="px-8 py-5 font-bold text-slate-800 text-sm">Bounding box (xyxy)</td>
                              <td className="px-8 py-5"><code className="bg-slate-100 px-3 py-1.5 rounded-lg text-xs font-mono text-blue-600">{JSON.stringify(det.bbox_xyxy)}</code></td>
                              <td className="px-8 py-5 font-black text-emerald-600">{det.confidence ? (det.confidence * 100).toFixed(1) : '0.0'}%</td>
                              <td className="px-8 py-5 font-black text-slate-400">{det.class_id}</td>
                              <td className="px-8 py-5"><span className="bg-blue-50 text-blue-600 px-3 py-1 rounded-lg text-xs font-black uppercase">{det.class_name}</span></td>
                            </tr>
                          ))
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {isVerifying && (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-md z-50 flex items-center justify-center">
           <div className="text-center">
              <Loader2 className="w-16 h-16 text-blue-600 animate-spin mx-auto mb-4" />
              <p className="font-black text-slate-800 text-xl">Verifying Patient Credentials...</p>
           </div>
        </div>
      )}

      {showWebcam && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[60] flex items-center justify-center">
          <div className="bg-white p-6 rounded-3xl max-w-xl w-full mx-4 shadow-2xl relative">
            <h3 className="text-xl font-black mb-4">Capture {activeTab === 'person' ? 'Face' : 'Object'}</h3>
            <div className="rounded-2xl overflow-hidden bg-black aspect-video mb-4">
              <Webcam
                audio={false}
                ref={webcamRef}
                screenshotFormat="image/jpeg"
                className="w-full h-full object-cover"
                onUserMediaError={(err) => {
                  console.error(err);
                  alert("Camera could not be started! Please check if your browser has camera permissions allowed, or if another app is using the camera.");
                }}
              />
            </div>
            <div className="flex gap-4 justify-end">
              <button onClick={() => setShowWebcam(false)} className="px-6 py-2 rounded-xl font-bold text-slate-500 hover:bg-slate-100">Cancel</button>
              <button onClick={capture} className="bg-blue-600 text-white px-8 py-2 rounded-xl font-black hover:bg-blue-700 flex items-center gap-2">
                <Camera size={18} />
                Capture & Upload
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PersonalizedObjectUpload;
