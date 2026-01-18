import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Hotel, Wallet, Calendar, Calculator, MapPin, Clock, Utensils, X, ArrowLeft, Globe, ChevronRight, Settings, Plane, FileText, CreditCard, Sparkles, Loader2, Banknote, BarChart3, Printer, Users, LogOut, AlertCircle } from 'lucide-react';

// --- Firebase Imports ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot } from 'firebase/firestore';

// --- Firebase Config ---
const firebaseConfig = {
  apiKey: "AIzaSyCUir-riOCQD69VxJdwJoTzB27tg7pWB6o",
  authDomain: "my-travel-planner-82ad9.firebaseapp.com",
  projectId: "my-travel-planner-82ad9",
  storageBucket: "my-travel-planner-82ad9.firebasestorage.app",
  messagingSenderId: "423871366071",
  appId: "1:423871366071:web:c139bdeb5bd5440b895e32",
  measurementId: "G-Y4F3E5E5JX"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'my-travel-planner';

// --- Gemini API Helper ---
const callGeminiAPI = async (prompt) => {
  const apiKey = "AIzaSyA3Itdm5wzt7sm0fNeBxI5wkYjZmMn-WA0"; 
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" }
        }),
      }
    );
    if (!response.ok) throw new Error(`API Error: ${response.status}`);
    const data = await response.json();
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) throw new Error("No response from Gemini");
    return JSON.parse(textResponse);
  } catch (error) {
    console.error("Gemini API Error:", error);
    throw error;
  }
};

// --- Common UI Component (Moved OUTSIDE to prevent re-renders) ---
const CommonUI = ({ children, isAiLoading, aiMessage, confirmDialog, setConfirmDialog, alertInfo, setAlertInfo }) => (
  <div className="min-h-screen bg-gray-50 text-gray-800 font-sans relative print:bg-white print:p-0">
    {isAiLoading && (
        <div className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center backdrop-blur-sm print:hidden">
            <div className="bg-white p-6 rounded-xl flex flex-col items-center shadow-2xl">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3"/>
                <p className="font-medium">{aiMessage}</p>
            </div>
        </div>
    )}
    
    {confirmDialog && (
        <div className="fixed inset-0 bg-black/50 z-[70] flex items-center justify-center p-4 animate-fade-in-up">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-xs w-full text-center">
                <h3 className="font-bold text-lg mb-2 text-gray-800">확인</h3>
                <p className="text-gray-600 mb-6 text-sm whitespace-pre-wrap">{confirmDialog.message}</p>
                <div className="flex gap-2">
                    <button onClick={() => setConfirmDialog(null)} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200">취소</button>
                    <button onClick={confirmDialog.onConfirm} className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700">확인</button>
                </div>
            </div>
        </div>
    )}

    {alertInfo && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-gray-800/90 text-white px-6 py-3 rounded-full shadow-lg text-sm animate-fade-in-down flex items-center gap-2 z-[80] backdrop-blur-md">
            <AlertCircle size={16} className={alertInfo.type === 'error' ? 'text-red-400' : 'text-blue-400'} /> 
            {alertInfo.message}
            <button onClick={() => setAlertInfo(null)} className="ml-2 hover:text-gray-300"><X size={14}/></button>
        </div>
    )}
    
    {children}
  </div>
);

// --- Main Component ---
const TravelPlanner = () => {
  const [user, setUser] = useState(null);
  
  // Share Code State
  const [shareCode, setShareCode] = useState(() => localStorage.getItem('trip_share_code') || '');
  const [inputShareCode, setInputShareCode] = useState('');
  const [isLoginStep, setIsLoginStep] = useState(!localStorage.getItem('trip_share_code'));

  const [view, setView] = useState('list');
  const [currentTripId, setCurrentTripId] = useState(null);
  const [trips, setTrips] = useState([]);
  
  // Detail View State
  const [tripData, setTripData] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editingConfig, setEditingConfig] = useState(null);

  // Analysis State
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [analysisResult, setAnalysisResult] = useState(null);

  // UI State
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiMessage, setAiMessage] = useState("");
  const [alertInfo, setAlertInfo] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const [newTripConfig, setNewTripConfig] = useState({
    country: '',
    startDate: new Date().toISOString().split('T')[0],
    duration: 3,
    currencyRate: 1
  });

  // Auth
  useEffect(() => {
    const initAuth = async () => {
        await signInAnonymously(auth);
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Load Trips
  useEffect(() => {
    if (!user || !shareCode) return;
    const tripsRef = collection(db, 'artifacts', appId, 'public', 'data', 'trips');
    const unsubscribe = onSnapshot(tripsRef, (snapshot) => {
      const loadedTrips = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(trip => trip.shareCode === shareCode);
      loadedTrips.sort((a, b) => new Date(b.config.startDate) - new Date(a.config.startDate));
      setTrips(loadedTrips);
    }, (error) => console.error("Error fetching trips:", error));
    return () => unsubscribe();
  }, [user, shareCode]);

  // Load Detail
  useEffect(() => {
    if (!user || !currentTripId) return;
    const tripRef = doc(db, 'artifacts', appId, 'public', 'data', 'trips', currentTripId);
    const unsubscribe = onSnapshot(tripRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        if (!data.preparation) data.preparation = { schedule: [] };
        setTripData(data);
      }
    }, (error) => console.error("Error fetching detail:", error));
    return () => unsubscribe();
  }, [user, currentTripId]);

  // Helpers
  const formatCurrency = (amount) => new Intl.NumberFormat('ko-KR').format(amount);
  const getFormattedDate = (startDateStr, dayOffset) => {
    if (!startDateStr) return '';
    const date = new Date(startDateStr);
    date.setDate(date.getDate() + dayOffset);
    return `${date.getMonth() + 1}.${date.getDate()} (${['일', '월', '화', '수', '목', '금', '토'][date.getDay()]})`;
  };
  const getTripTotalCost = (data) => {
    if (!data) return 0;
    const { days, config, preparation } = data;
    const daysTotal = (days || []).reduce((acc, day) => acc + day.schedule.reduce((dAcc, item) => dAcc + (Number(item.cost) || 0), 0), 0);
    const prepTotal = (preparation?.schedule || []).reduce((acc, item) => acc + (Number(item.cost) || 0), 0);
    return Math.floor(daysTotal * config.currencyRate) + prepTotal;
  };
  const showAlert = (message, type = 'info') => setAlertInfo({ message, type });

  // Handlers
  const handleLogin = () => {
    if (!inputShareCode.trim()) return showAlert("공유 코드를 입력해주세요.", "error");
    const code = inputShareCode.trim();
    localStorage.setItem('trip_share_code', code);
    setShareCode(code);
    setIsLoginStep(false);
  };
  const handleLogoutClick = () => {
    setConfirmDialog({
        message: "공유 코드를 변경하시겠습니까?\n현재 화면에서 나가게 됩니다.",
        onConfirm: () => {
            localStorage.removeItem('trip_share_code');
            setShareCode('');
            setInputShareCode('');
            setIsLoginStep(true);
            setView('list');
            setConfirmDialog(null);
        }
    });
  };

  const handleCreateTrip = async () => {
    if (!user || !shareCode) return;
    if (!newTripConfig.country) return showAlert("여행 국가를 입력해주세요.", "error");
    setIsAiLoading(true); setAiMessage("여행 일정을 생성 중입니다...");
    const initialDays = Array.from({ length: newTripConfig.duration }, (_, i) => ({
      id: Date.now() + i, dayNum: i + 1, hotel: '',
      schedule: [
        { id: `d${i}-1`, time: '08:00', title: '아침 식사', type: 'meal', cost: 0, memo: '' },
        { id: `d${i}-2`, time: '12:00', title: '점심 식사', type: 'meal', cost: 0, memo: '' },
        { id: `d${i}-3`, time: '18:00', title: '저녁 식사', type: 'meal', cost: 0, memo: '' },
      ]
    }));
    const initialPrep = { schedule: [{ id: 'p-1', time: '-', title: '항공권 예매', type: 'flight', cost: 0, memo: '' }] };
    try {
      const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'trips'), {
        shareCode: shareCode, config: newTripConfig, days: initialDays, preparation: initialPrep, createdAt: new Date().toISOString()
      });
      setCurrentTripId(docRef.id); setView('detail');
    } catch (e) { showAlert("오류가 발생했습니다.", "error"); } 
    finally { setIsAiLoading(false); setAiMessage(""); }
  };

  const handleDeleteTripClick = (e, tripId) => {
    e.stopPropagation();
    setConfirmDialog({
        message: "정말 삭제하시겠습니까?\n복구할 수 없습니다.",
        onConfirm: async () => {
            try {
                await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trips', tripId));
                if (currentTripId === tripId) { setView('list'); setCurrentTripId(null); }
                setConfirmDialog(null);
            } catch (error) { showAlert("삭제 실패", "error"); }
        }
    });
  };

  const updateCurrentTrip = async (updatedData) => {
    if (!user || !currentTripId) return;
    try { await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'trips', currentTripId), updatedData); } catch (error) {}
  };

  const handleAiCreateTrip = async () => {
    if (!user) return;
    if (!newTripConfig.country) return showAlert("국가를 입력해주세요.", "error");
    setIsAiLoading(true); setAiMessage(`${newTripConfig.country} 일정 생성 중...`);
    const prompt = `Plan a ${newTripConfig.duration}-day travel itinerary for ${newTripConfig.country}. Return JSON: { "days": [ { "schedule": [ { "time": "09:00", "title": "Activity", "type": "activity", "memo": "Tip", "cost": 0 } ] } ] }. Include meals.`;
    try {
        const aiData = await callGeminiAPI(prompt);
        if (!aiData?.days) throw new Error("Invalid Response");
        const generatedDays = aiData.days.map((dayData, index) => ({
            id: Date.now() + index, dayNum: index + 1, hotel: '',
            schedule: dayData.schedule.map((item, i) => ({ ...item, id: `d${index}-${i}`, cost: 0 }))
        }));
        while(generatedDays.length < newTripConfig.duration) { const i = generatedDays.length; generatedDays.push({ id: Date.now()+i, dayNum: i+1, hotel: '', schedule: [] }); }
        const initialPrep = { schedule: [{ id: 'p-1', time: '-', title: '항공권', type: 'flight', cost: 0, memo: '' }] };
        const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'trips'), {
            shareCode: shareCode, config: newTripConfig, days: generatedDays, preparation: initialPrep, createdAt: new Date().toISOString()
        });
        setCurrentTripId(docRef.id); setView('detail');
    } catch (e) { showAlert("AI 생성 실패. 수동으로 진행합니다.", "error"); handleCreateTrip(); }
    finally { setIsAiLoading(false); setAiMessage(""); }
  };

  const handleAiRecommendPrep = async () => {
    setIsAiLoading(true); setAiMessage("준비물 분석 중...");
    const prompt = `Recommend 5 essential travel items for ${tripData.config.country}. JSON Array: [{"title": "Item", "memo": "Reason"}]`;
    try {
        const items = await callGeminiAPI(prompt);
        if(!Array.isArray(items)) throw new Error("Invalid");
        const newItems = items.map((it, i) => ({ id: Date.now()+i, time: '-', title: it.title, type: 'activity', cost: 0, memo: it.memo }));
        const updatedSchedule = [...(tripData.preparation?.schedule || []), ...newItems];
        await updateCurrentTrip({ preparation: { ...tripData.preparation, schedule: updatedSchedule } });
    } catch (e) { showAlert("추천 실패", "error"); } finally { setIsAiLoading(false); setAiMessage(""); }
  };

  const handleAnalyzeExpenses = async () => {
    setIsAiLoading(true); setAiMessage("지출 분석 중...");
    let allItems = [];
    tripData.preparation?.schedule?.forEach(i => i.cost > 0 && allItems.push({...i, costKRW: i.cost, period: '여행 전'}));
    tripData.days?.forEach(d => d.schedule?.forEach(i => i.cost > 0 && allItems.push({...i, costKRW: Math.floor(i.cost * tripData.config.currencyRate), period: '여행 중'})));
    if(allItems.length === 0) { setIsAiLoading(false); return showAlert("분석할 지출 내역이 없습니다.", "info"); }
    const prompt = `Analyze expenses for ${tripData.config.country}. Data: ${JSON.stringify(allItems)}. Return JSON: { "totalCost": number, "categoryBreakdown": [{"name": string, "amount": number, "percentage": number}], "paymentMethodBreakdown": [{"name": string, "amount": number, "percentage": number}], "periodBreakdown": [{"name": string, "amount": number, "percentage": number}], "overallComment": string (Korean) }`;
    try {
        const result = await callGeminiAPI(prompt);
        if(result) { setAnalysisResult(result); setIsAnalysisOpen(true); }
    } catch(e) { showAlert("분석 실패", "error"); } finally { setIsAiLoading(false); setAiMessage(""); }
  };

  const handleLocalHotelChange = (dayId, val) => setTripData(p => ({ ...p, days: p.days.map(d => d.id === dayId ? { ...d, hotel: val } : d) }));
  const handleHotelSave = () => updateCurrentTrip({ days: tripData.days });
  const handleSaveConfig = () => { updateCurrentTrip({ config: editingConfig }); setIsConfigModalOpen(false); };
  
  const saveItem = () => {
    if (!editingItem || !tripData) return;
    const isPrep = editingItem.dayId === 'preparation';
    const collection = isPrep ? tripData.preparation : tripData.days.find(d => d.id === editingItem.dayId);
    let updatedSchedule = collection.schedule.map(i => i.id === editingItem.id ? editingItem : i);
    if (!collection.schedule.find(i => i.id === editingItem.id)) updatedSchedule.push(editingItem);
    if (!isPrep) updatedSchedule.sort((a,b) => a.time.localeCompare(b.time));
    const updatePayload = isPrep ? { preparation: { ...tripData.preparation, schedule: updatedSchedule } } 
        : { days: tripData.days.map(d => d.id === editingItem.dayId ? { ...d, schedule: updatedSchedule } : d) };
    updateCurrentTrip(updatePayload); setIsModalOpen(false); setEditingItem(null);
  };

  const deleteScheduleItem = (dayId, itemId) => {
    const isPrep = dayId === 'preparation';
    const updatePayload = isPrep ? { preparation: { ...tripData.preparation, schedule: tripData.preparation.schedule.filter(i => i.id !== itemId) } }
        : { days: tripData.days.map(d => d.id === dayId ? { ...d, schedule: d.schedule.filter(i => i.id !== itemId) } : d) };
    updateCurrentTrip(updatePayload); setIsModalOpen(false);
  };

  // --- Render ---
  // Pass props to CommonUI to allow it to render UI elements
  const commonUIProps = { isAiLoading, aiMessage, confirmDialog, setConfirmDialog, alertInfo, setAlertInfo };

  if (isLoginStep) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm text-center">
            <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"><Users className="text-blue-600 w-8 h-8" /></div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">여행 공유 시작하기</h1>
            <p className="text-gray-500 mb-6 text-sm">가족이나 친구와 함께 공유할<br/>고유 코드를 입력해주세요.</p>
            <input type="text" value={inputShareCode} onChange={(e) => setInputShareCode(e.target.value)} placeholder="예: 우리가족여행2026" className="w-full border border-gray-300 bg-white text-gray-900 rounded-xl p-4 text-center text-lg font-bold mb-4 focus:ring-2 focus:ring-blue-500 outline-none uppercase" />
            <button onClick={handleLogin} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg">입장하기</button>
        </div>
        {alertInfo && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg text-sm flex items-center gap-2"><AlertCircle size={16} /> {alertInfo.message}<button onClick={() => setAlertInfo(null)} className="ml-2"><X size={14}/></button></div>}
      </div>
    );
  }

  if (view === 'new') {
      return (
        <CommonUI {...commonUIProps}>
            <div className="flex items-center justify-center p-4 min-h-[80vh]">
                <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-lg">
                    <h2 className="text-xl font-bold mb-6 text-gray-800">새 여행 계획</h2>
                    <div className="space-y-4">
                        <input type="text" className="w-full border border-gray-300 bg-white text-gray-900 p-3 rounded-lg outline-none focus:border-blue-500" placeholder="국가 (예: 태국)" value={newTripConfig.country} onChange={e => setNewTripConfig({...newTripConfig, country: e.target.value})} />
                        <input type="date" className="w-full border border-gray-300 bg-white text-gray-900 p-3 rounded-lg outline-none focus:border-blue-500" value={newTripConfig.startDate} onChange={e => setNewTripConfig({...newTripConfig, startDate: e.target.value})} />
                        <div className="flex gap-4">
                            <input type="number" className="w-full border border-gray-300 bg-white text-gray-900 p-3 rounded-lg outline-none focus:border-blue-500" placeholder="기간 (일)" value={newTripConfig.duration} onChange={e => setNewTripConfig({...newTripConfig, duration: Number(e.target.value)})} />
                            <input type="number" className="w-full border border-gray-300 bg-white text-gray-900 p-3 rounded-lg outline-none focus:border-blue-500" placeholder="환율" value={newTripConfig.currencyRate} onChange={e => setNewTripConfig({...newTripConfig, currencyRate: Number(e.target.value)})} />
                        </div>
                        <div className="pt-4 flex flex-col gap-3">
                            <button onClick={handleAiCreateTrip} className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold flex items-center justify-center gap-2 shadow-md"><Sparkles size={18}/> AI 자동 생성</button>
                            <div className="flex gap-3">
                                <button onClick={() => setView('list')} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-gray-600 hover:bg-gray-200">취소</button>
                                <button onClick={handleCreateTrip} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-sm">수동 생성</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </CommonUI>
      );
  }

  if (view === 'detail' && tripData) {
    const { config, days, preparation } = tripData;
    const totalCost = getTripTotalCost(tripData);
    return (
      <CommonUI {...commonUIProps}>
        <header className="bg-blue-600 text-white p-4 shadow-md sticky top-0 z-10 print:hidden">
          <div className="max-w-4xl mx-auto flex justify-between items-center">
            <button onClick={() => setView('list')} className="flex items-center gap-1 hover:bg-blue-700 py-1 px-2 rounded transition text-sm"><ArrowLeft size={16} /> 목록</button>
            <h1 className="text-lg font-bold">{config.country} 여행</h1>
            <div className="text-xs bg-blue-700 px-3 py-1 rounded-full">{formatCurrency(totalCost)} 원</div>
          </div>
        </header>
        <main className="max-w-4xl mx-auto p-4 space-y-6 print:hidden">
          <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200 relative">
             <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-600 items-center">
                 <span className="flex items-center gap-1"><Calendar size={14}/> {config.startDate}</span>
                 <span className="flex items-center gap-1"><Clock size={14}/> {config.duration}일간</span>
                 <span className="flex items-center gap-1 text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded"><Calculator size={14}/> 환율 {config.currencyRate}원</span>
                 <span className="flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100"><Wallet size={14}/> {formatCurrency(totalCost)}원</span>
             </div>
             <button onClick={() => { setEditingConfig(config); setIsConfigModalOpen(true); }} className="absolute top-4 right-4 p-1 text-gray-400 hover:text-blue-600"><Settings size={20}/></button>
          </div>
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-indigo-100 overflow-hidden ring-1 ring-indigo-50">
                <div className="bg-indigo-50 p-4 border-b border-indigo-100 flex justify-between items-center">
                    <span className="bg-indigo-600 text-white text-sm font-bold px-3 py-1 rounded-full">Day 0 (준비)</span>
                    <div className="flex gap-2">
                        <button onClick={handleAiRecommendPrep} className="text-xs bg-white text-indigo-600 px-3 py-1.5 rounded-lg font-bold flex items-center gap-1 border border-indigo-200 hover:bg-indigo-50"><Sparkles size={14}/> AI 추천</button>
                        <button onClick={() => { setEditingItem({ dayId: 'preparation', time: '-', title: '', type: 'activity', cost: 0 }); setIsModalOpen(true); }} className="text-sm text-indigo-600 font-medium flex items-center gap-1 hover:text-indigo-800"><Plus size={16}/> 추가</button>
                    </div>
                </div>
                <div className="divide-y divide-gray-100">
                    {preparation?.schedule?.map(item => (
                         <div key={item.id} onClick={() => { setEditingItem({ dayId: 'preparation', ...item }); setIsModalOpen(true); }} className="p-4 hover:bg-indigo-50 cursor-pointer flex items-center gap-4">
                            <div className="flex-1">
                                <div className="flex flex-wrap items-center gap-2 font-medium text-gray-800">
                                    {item.type === 'flight' ? <Plane size={16} className="text-sky-500"/> : item.type === 'hotel' ? <Hotel size={16} className="text-indigo-500"/> : <FileText size={16} className="text-green-500"/>} {item.title}
                                    {(item.cost > 0 || item.paymentMethod) && (
                                         <div className="text-xs text-gray-500 flex items-center gap-1.5 bg-gray-50 px-2 py-0.5 rounded">
                                            {item.paymentMethod === 'cash' ? <Banknote size={12}/> : item.paymentMethod === 'other' ? <Sparkles size={12}/> : <CreditCard size={12}/>} 
                                            <span className="font-medium">{item.paymentMethod === 'cash' ? '현금' : item.paymentMethod === 'other' ? '기타' : '카드'}</span>
                                            {item.paymentDetail && <span className="text-gray-400">| {item.paymentDetail}</span>}
                                         </div>
                                    )}
                                </div>
                                {item.memo && <div className="text-xs text-gray-400 mt-1 pl-6 line-clamp-1">{item.memo}</div>}
                            </div>
                            <div className="text-right whitespace-nowrap">{item.cost > 0 ? <span className="font-bold text-gray-900">{formatCurrency(item.cost)}원</span> : <span className="text-xs text-gray-300">비용 입력</span>}</div>
                        </div>
                    ))}
                    {(!preparation?.schedule || preparation.schedule.length === 0) && <div className="p-8 text-center text-gray-400 text-sm">준비 내역을 기록하세요.</div>}
                </div>
            </div>
            {days.map((day, idx) => (
                <div key={day.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 p-4 border-b border-gray-200 flex flex-wrap justify-between items-center gap-2">
                    <div className="flex items-center gap-2">
                        <span className="bg-blue-100 text-blue-800 text-sm font-bold px-3 py-1 rounded-full">Day {day.dayNum}</span>
                        <span className="text-gray-500 text-sm">{getFormattedDate(config.startDate, idx)}</span>
                        <input type="text" placeholder="숙소 입력" value={day.hotel} onChange={e => handleLocalHotelChange(day.id, e.target.value)} onBlur={handleHotelSave} className="bg-white border border-gray-200 text-gray-900 rounded px-2 py-1 text-sm w-32 md:w-48 ml-2 focus:ring-2 focus:ring-blue-500 outline-none"/>
                    </div>
                    <button onClick={() => { setEditingItem({ dayId: day.id, time: '10:00', title: '', type: 'activity', cost: 0, paymentMethod: 'card' }); setIsModalOpen(true); }} className="text-sm text-blue-600 font-medium flex items-center gap-1 hover:text-blue-800"><Plus size={16}/> 추가</button>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {day.schedule.map(item => (
                      <div key={item.id} onClick={() => { setEditingItem({ dayId: day.id, ...item }); setIsModalOpen(true); }} className="p-4 hover:bg-blue-50 cursor-pointer flex items-center gap-4">
                        <div className="w-16 text-sm font-mono text-gray-500 font-medium">{item.time}</div>
                        <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2 font-medium text-gray-800">
                                {item.type === 'meal' ? <Utensils size={16} className="text-orange-500"/> : <MapPin size={16} className="text-blue-500"/>} {item.title}
                                {(item.cost > 0 || item.paymentMethod) && (
                                    <div className="text-xs text-gray-500 flex items-center gap-1.5 bg-gray-50 px-2 py-0.5 rounded">
                                    {item.paymentMethod === 'cash' ? <Banknote size={12}/> : item.paymentMethod === 'other' ? <Sparkles size={12}/> : <CreditCard size={12}/>} 
                                    <span className="font-medium">{item.paymentMethod === 'cash' ? '현금' : item.paymentMethod === 'other' ? '기타' : '카드'}</span>
                                    {item.paymentDetail && <span className="text-gray-400">| {item.paymentDetail}</span>}
                                    </div>
                                )}
                            </div>
                            {item.memo && <div className="text-xs text-gray-400 mt-1 pl-6 line-clamp-1">{item.memo}</div>}
                        </div>
                        <div className="text-right whitespace-nowrap">
                            {item.cost > 0 ? (
                                <div className="flex flex-col items-end">
                                    <span className="font-bold text-gray-900">{formatCurrency(item.cost)} <span className="text-xs font-normal text-gray-500">Local</span></span>
                                    <span className="text-xs text-blue-600 font-medium">≈ {formatCurrency(Math.floor(item.cost * config.currencyRate))} 원</span>
                                </div>
                            ) : <span className="text-xs text-gray-300">비용 입력</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
            ))}
          </div>
          <button onClick={handleAnalyzeExpenses} className="w-full mt-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-3 mb-8 hover:shadow-xl hover:scale-[1.01] transition-all">
            <BarChart3 size={24} /> AI 지출 분석 & 보고서
          </button>
        </main>

        {isModalOpen && editingItem && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden animate-fade-in-up">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
                    <h3 className="font-bold text-lg text-gray-800 mb-4">{editingItem.dayId === 'preparation' ? '준비 항목' : '일정 상세'}</h3>
                    <div className="flex gap-4">
                        <input type="time" className="border border-gray-300 bg-white text-gray-900 rounded-lg p-2 w-1/3 outline-none focus:ring-2 focus:ring-blue-500" value={editingItem.time} onChange={e => setEditingItem({...editingItem, time: e.target.value})}/>
                        <input type="text" className="border border-gray-300 bg-white text-gray-900 rounded-lg p-2 w-2/3 outline-none focus:ring-2 focus:ring-blue-500" placeholder="항목명" value={editingItem.title} onChange={e => setEditingItem({...editingItem, title: e.target.value})}/>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500">비용 ({editingItem.dayId === 'preparation' ? '원화' : '현지화'})</label>
                        <div className="relative mt-1">
                            <input type="number" className="w-full border border-gray-300 bg-white text-gray-900 rounded-lg p-3 pl-10 text-lg font-bold outline-none focus:ring-2 focus:ring-blue-500" placeholder="0" value={editingItem.cost} onChange={e => setEditingItem({...editingItem, cost: Number(e.target.value)})}/>
                            <Calculator className="absolute left-3 top-3.5 text-gray-400" size={18}/>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500">결제 수단</label>
                        <div className="flex gap-2 mt-1">
                            <select className="border border-gray-300 rounded-lg p-2 bg-white text-gray-900 outline-none focus:ring-2 focus:ring-blue-500" value={editingItem.paymentMethod || 'card'} onChange={e => setEditingItem({...editingItem, paymentMethod: e.target.value})}>
                                <option value="card">카드</option><option value="cash">현금</option><option value="other">기타</option>
                            </select>
                            <input type="text" className="border border-gray-300 bg-white text-gray-900 rounded-lg p-2 flex-1 outline-none focus:ring-2 focus:ring-blue-500" placeholder="상세 (예: 트래블로그)" value={editingItem.paymentDetail || ''} onChange={e => setEditingItem({...editingItem, paymentDetail: e.target.value})}/>
                        </div>
                    </div>
                    <textarea className="w-full border border-gray-300 bg-white text-gray-900 rounded-lg p-2 resize-none outline-none focus:ring-2 focus:ring-blue-500" rows="2" placeholder="메모" value={editingItem.memo || ''} onChange={e => setEditingItem({...editingItem, memo: e.target.value})}/>
                    <div className="flex justify-between pt-4">
                        <button onClick={() => deleteScheduleItem(editingItem.dayId, editingItem.id)} className="text-red-500 p-2 hover:bg-red-50 rounded-lg transition"><Trash2/></button>
                        <div className="flex gap-2">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition">취소</button>
                            <button onClick={saveItem} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-md">저장</button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {isConfigModalOpen && editingConfig && (
             <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 print:hidden animate-fade-in-up">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4">
                    <h3 className="font-bold text-lg">설정 수정</h3>
                    <input type="text" className="w-full border border-gray-300 bg-white text-gray-900 p-2 rounded outline-none focus:ring-2 focus:ring-blue-500" value={editingConfig.country} onChange={e => setEditingConfig({...editingConfig, country: e.target.value})}/>
                    <input type="date" className="w-full border border-gray-300 bg-white text-gray-900 p-2 rounded outline-none focus:ring-2 focus:ring-blue-500" value={editingConfig.startDate} onChange={e => setEditingConfig({...editingConfig, startDate: e.target.value})}/>
                    <input type="number" className="w-full border border-gray-300 bg-white text-gray-900 p-2 rounded font-bold outline-none focus:ring-2 focus:ring-blue-500" value={editingConfig.currencyRate} onChange={e => setEditingConfig({...editingConfig, currencyRate: Number(e.target.value)})}/>
                    <div className="flex justify-end gap-2 pt-2">
                        <button onClick={() => setIsConfigModalOpen(false)} className="px-4 py-2 bg-gray-100 rounded hover:bg-gray-200 transition">취소</button>
                        <button onClick={handleSaveConfig} className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 shadow-md transition">수정</button>
                    </div>
                </div>
             </div>
        )}

        {isAnalysisOpen && analysisResult && (
            <div className="fixed inset-0 bg-white z-[100] overflow-y-auto p-8 print:p-0 animate-fade-in-up">
                <div className="max-w-4xl mx-auto space-y-8">
                    <div className="flex justify-between print:hidden">
                        <h2 className="text-2xl font-bold flex gap-2 text-gray-800"><BarChart3 className="text-blue-600"/> 지출 분석</h2>
                        <div className="flex gap-2">
                            <button onClick={() => window.print()} className="px-4 py-2 bg-gray-900 text-white rounded-lg flex gap-2 hover:bg-black transition"><Printer size={18}/> PDF/인쇄</button>
                            <button onClick={() => setIsAnalysisOpen(false)} className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition text-gray-700">닫기</button>
                        </div>
                    </div>
                    <div className="border-b pb-4">
                        <h1 className="text-3xl font-bold mb-2 text-gray-900">{config.country} 여행 지출 보고서</h1>
                        <p className="text-gray-500 font-medium">총 지출: {formatCurrency(analysisResult.totalCost)}원</p>
                    </div>
                    <div className="bg-blue-50 p-6 rounded-xl border border-blue-100">
                        <h3 className="font-bold text-blue-800 mb-2 flex gap-2"><Sparkles size={18}/> AI 총평</h3>
                        <p className="text-blue-900 leading-relaxed text-sm md:text-base">{analysisResult.overallComment}</p>
                    </div>
                    <div className="grid md:grid-cols-2 gap-8">
                        <div>
                            <h3 className="font-bold mb-4 text-gray-800 flex items-center gap-2"><Utensils size={18}/> 항목별 지출</h3>
                            <div className="space-y-3">
                                {analysisResult.categoryBreakdown?.map((c,i) => (
                                    <div key={i} className="flex items-center gap-4">
                                        <div className="w-20 text-sm font-medium text-gray-600">{c.name}</div>
                                        <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{width: `${c.percentage}%`}}></div></div>
                                        <div className="text-sm font-bold w-24 text-right">{formatCurrency(c.amount)}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                         <div>
                            <h3 className="font-bold mb-4 text-gray-800 flex items-center gap-2"><CreditCard size={18}/> 결제 수단별</h3>
                            <div className="bg-gray-50 p-4 rounded-xl">
                                {analysisResult.paymentMethodBreakdown?.map((m,i) => (
                                    <div key={i} className="flex justify-between mb-3 last:mb-0 text-sm">
                                        <span className="flex items-center gap-2 text-gray-600">
                                            <div className={`w-3 h-3 rounded-full ${i===0?'bg-purple-500':i===1?'bg-pink-500':'bg-gray-400'}`}></div>
                                            {m.name}
                                        </span>
                                        <span className="font-bold">{formatCurrency(m.amount)} <span className="text-gray-400 font-normal">({m.percentage}%)</span></span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="text-center text-xs text-gray-400 mt-12">
                        Generated by AI Trip Manager • {new Date().toLocaleDateString()}
                    </div>
                </div>
            </div>
        )}
      </CommonUI>
    );
  }

  // List View (Default)
  return (
      <CommonUI {...commonUIProps}>
        <div className="p-4 max-w-2xl mx-auto space-y-6">
          <header className="flex justify-between items-center mb-6 pt-4">
            <div>
                <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                    <Globe className="text-blue-600" /> My Trips
                </h1>
                <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-medium">CODE: {shareCode}</span>
                    <button onClick={handleLogoutClick} className="text-xs text-gray-400 underline flex items-center gap-1 hover:text-red-500"><LogOut size={10}/> 변경</button>
                </div>
            </div>
            <button onClick={() => { setNewTripConfig({ country: '', startDate: new Date().toISOString().split('T')[0], duration: 3, currencyRate: 1 }); setView('new'); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 shadow-sm flex items-center gap-2">
              <Plus size={18} /> 새 여행
            </button>
          </header>

          <div className="grid gap-4">
            {trips.length === 0 ? (
                <div className="bg-white p-10 rounded-xl border border-dashed border-gray-300 text-center text-gray-400">
                    <MapPin className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p>공유된 여행이 없습니다.<br/>새로운 여행을 만들어보세요!</p>
                </div>
            ) : trips.map(trip => (
                <div key={trip.id} onClick={() => { setCurrentTripId(trip.id); setView('detail'); }} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md cursor-pointer relative group transition-all">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="text-xl font-bold text-gray-800">{trip.config.country}</h3>
                            <div className="flex items-center gap-2 text-sm text-gray-500 mt-1"><Calendar size={14} /> {trip.config.startDate} ({trip.config.duration}일)</div>
                        </div>
                        <div className="text-right">
                            <span className="text-lg font-bold text-blue-600">{formatCurrency(getTripTotalCost(trip))} 원</span>
                        </div>
                    </div>
                    <button onClick={(e) => handleDeleteTripClick(e, trip.id)} className="absolute bottom-4 right-4 text-gray-300 hover:text-red-500 p-2 z-10 transition-colors"><Trash2 size={16}/></button>
                </div>
            ))}
          </div>
        </div>
      </CommonUI>
    );
};

export default TravelPlanner;