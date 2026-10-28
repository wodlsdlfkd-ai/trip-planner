import React, { useState, useEffect, useRef } from 'react';
import { requestTripAction } from './tripApi.js';
import ImportDialog from './ImportDialog.jsx';
import { Plus, Trash2, Hotel, Wallet, Calendar, Calculator, MapPin, Clock, Utensils, X, ArrowLeft, Globe, Settings, Plane, CreditCard, Download, Loader2, Banknote, Users, LogOut, AlertCircle, Coffee, ShoppingBag, Camera, Bus, Pencil } from 'lucide-react';

// --- Firebase Imports ---
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, query, where, onSnapshot } from 'firebase/firestore';

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
// Direct Firestore writes stay denied; edits go through the authenticated server API.

// --- Categories Definition ---
const CATEGORIES = [
    { id: 'meal', label: '식사', icon: Utensils, color: 'text-orange-500', bg: 'bg-orange-50', border: 'border-orange-200' },
    { id: 'coffee', label: '카페', icon: Coffee, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
    { id: 'activity', label: '관광', icon: Camera, color: 'text-blue-500', bg: 'bg-blue-50', border: 'border-blue-200' },
    { id: 'transport', label: '이동', icon: Bus, color: 'text-indigo-500', bg: 'bg-indigo-50', border: 'border-indigo-200' },
    { id: 'shopping', label: '쇼핑', icon: ShoppingBag, color: 'text-purple-500', bg: 'bg-purple-50', border: 'border-purple-200' },
    { id: 'hotel', label: '숙소', icon: Hotel, color: 'text-rose-500', bg: 'bg-rose-50', border: 'border-rose-200' },
    { id: 'flight', label: '항공', icon: Plane, color: 'text-sky-500', bg: 'bg-sky-50', border: 'border-sky-200' },
    { id: 'money', label: '비용', icon: Wallet, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-200' },
    { id: 'etc', label: '기타', icon: MapPin, color: 'text-gray-500', bg: 'bg-gray-50', border: 'border-gray-200' },
];

const getCategoryIcon = (type) => {
    const cat = CATEGORIES.find(c => c.id === type) || CATEGORIES.find(c => c.id === 'etc');
    const Icon = cat.icon;
    return <Icon size={16} className={cat.color} />;
};

// --- Common UI Component ---
const CommonUI = ({ children, isBusy, busyMessage, confirmDialog, setConfirmDialog, alertInfo, setAlertInfo }) => (
  <div className="min-h-screen bg-gray-50 text-gray-800 font-sans relative print:bg-white print:p-0">
    {isBusy && (
        <div className="fixed inset-0 bg-black/30 z-[60] flex items-center justify-center backdrop-blur-sm print:hidden">
            <div className="bg-white p-6 rounded-xl flex flex-col items-center shadow-2xl">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3"/>
                <p className="font-medium">{busyMessage}</p>
            </div>
        </div>
    )}
    
    {confirmDialog && (
        <div className="fixed inset-0 bg-black/50 z-[70] overflow-y-auto flex items-center justify-center p-4 animate-fade-in-up">
            <div className="bg-white rounded-xl shadow-2xl p-6 max-w-xs w-full text-center relative">
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
  const [authError, setAuthError] = useState(null);
  
  const [shareCode, setShareCode] = useState(() => localStorage.getItem('trip_share_code') || '');
  const [inputShareCode, setInputShareCode] = useState('');
  const [editingAccess, setEditingAccess] = useState(null);
  const IS_READ_ONLY = !editingAccess?.enabled || editingAccess.shareCode !== shareCode || editingAccess.uid !== user?.uid;
  const mutationInFlight = useRef(false);
  const newTripRequest = useRef(null);
  const editingTarget = useRef(null);
  const [hotelDraft, setHotelDraft] = useState(null);
  const [isLoginStep, setIsLoginStep] = useState(!localStorage.getItem('trip_share_code'));

  const [view, setView] = useState('list');
  const [currentTripId, setCurrentTripId] = useState(null);
  const [tripList, setTripList] = useState(null);
  const trips = tripList?.shareCode === shareCode && tripList?.uid === user?.uid
    ? tripList.trips : [];
  const listError = authError || (tripList?.shareCode === shareCode && tripList?.uid === user?.uid ? tripList.error : null);
  const isTripsLoading = !listError && (!user || tripList?.shareCode !== shareCode || tripList?.uid !== user.uid);
  
  const [tripData, setTripData] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editingConfig, setEditingConfig] = useState(null);


  const [isBusy, setIsBusy] = useState(false);
  const [busyMessage, setBusyMessage] = useState("");
  const [alertInfo, setAlertInfo] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const [newTripConfig, setNewTripConfig] = useState({
    country: '',
    startDate: new Date().toLocaleDateString('sv-SE'),
    duration: 3,
    currencyRate: 1
  });

  useEffect(() => {
    let active = true;
    const handleAuthError = (error) => {
      console.error('Firebase authentication failed:', error);
      if (active) setAuthError(error);
    };
    const unsubscribe = onAuthStateChanged(auth, (authenticatedUser) => {
      if (!active) return;
      setUser(authenticatedUser);
      if (authenticatedUser) setAuthError(null);
    }, handleAuthError);
    signInAnonymously(auth).catch(handleAuthError);
    return () => { active = false; unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!user || !shareCode) return;
    let active = true;
    requestTripAction(user, shareCode, { action: 'capabilities' }).then(() => {
      if (active) setEditingAccess({ uid: user.uid, shareCode, enabled: true });
    }).catch(error => {
      if (active) setEditingAccess({ uid: user.uid, shareCode, enabled: false });
      if (error.code !== 'editing-unavailable') console.error('Editing access check failed:', error.message);
    });
    return () => { active = false; };
  }, [user, shareCode]);

  useEffect(() => {
    if (!user || !shareCode) return;
    const tripsRef = collection(db, 'artifacts', appId, 'public', 'data', 'trips');
    let active = true;
    const unsubscribe = onSnapshot(query(tripsRef, where('shareCode', '==', shareCode)), (snapshot) => {
      if (!active) return;
      const loadedTrips = snapshot.docs
        .map(doc => ({ ...doc.data(), id: doc.id }));
      loadedTrips.sort((a, b) => new Date(b.config.startDate) - new Date(a.config.startDate));
      setTripList({ shareCode, uid: user.uid, trips: loadedTrips, error: null });
    }, (error) => {
      console.error('Error fetching trips:', error);
      if (active) setTripList({ shareCode, uid: user.uid, trips: [], error });
    });
    return () => { active = false; unsubscribe(); };
  }, [user, shareCode]);

  useEffect(() => {
    if (!user || !currentTripId || !shareCode) return;
    // The recovery rules allow code-filtered queries, never direct document gets.
    const tripsRef = collection(db, 'artifacts', appId, 'public', 'data', 'trips');
    let active = true;
    const unsubscribe = onSnapshot(query(tripsRef, where('shareCode', '==', shareCode)), (snapshot) => {
      if (!active) return;
      const currentDocument = snapshot.docs.find(item => item.id === currentTripId);
      if (currentDocument) {
        const data = currentDocument.data();
        if (!data.preparation) data.preparation = { schedule: [] };
        setTripData(data);
      } else if (!snapshot.metadata.fromCache) {
        setTripData(null);
        setView('list');
      }
    }, (error) => {
      console.error('Error fetching detail:', error);
      if (!active) return;
      setTripData(null);
      setView('list');
      setAlertInfo({ message: `상세 조회 실패: ${error.code || 'unknown'} — ${error.message}`, type: 'error' });
    });
    return () => { active = false; unsubscribe(); };
  }, [user, currentTripId, shareCode]);

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
            setCurrentTripId(null);
            setTripData(null);
            setTripList(null);
            setEditingAccess(null);
            setHotelDraft(null);
            setIsModalOpen(false);
            setIsConfigModalOpen(false);
            editingTarget.current = null;
            newTripRequest.current = null;
            setConfirmDialog(null);
        }
    });
  };

  const versionOf = data => data?.updatedAt || data?.createdAt || null;
  const handleCreateTrip = async () => {
    if (IS_READ_ONLY || mutationInFlight.current) return;
    if (!newTripConfig.country.trim() || !Number.isInteger(newTripConfig.duration) || newTripConfig.duration < 1 || newTripConfig.duration > 90 || !Number.isFinite(newTripConfig.currencyRate) || newTripConfig.currencyRate <= 0 || !newTripConfig.startDate) {
      return showAlert('여행명·시작일·기간(1~90일)·양수 환율을 확인해 주세요.', 'error');
    }
    mutationInFlight.current = true;
    setIsBusy(true); setBusyMessage('여행 일정을 생성 중입니다...');
    const signature = JSON.stringify(newTripConfig);
    if (newTripRequest.current?.signature !== signature) newTripRequest.current = { id: crypto.randomUUID(), signature };
    try {
      const result = await requestTripAction(user, shareCode, { action: 'create', config: newTripConfig, requestId: newTripRequest.current.id });
      setSelectedDay(null); setTripData(null); setCurrentTripId(result.tripId); setView('detail');
      newTripRequest.current = null;
    } catch (error) { console.error('Trip creation failed:', error.message); showAlert(error.message, 'error'); }
    finally { mutationInFlight.current = false; setIsBusy(false); setBusyMessage(''); }
  };

  const handleDeleteTripClick = e => { e.stopPropagation(); showAlert('여행 삭제는 아직 지원하지 않습니다.'); };

  const saveMutation = async (action, payload, target) => {
    if (IS_READ_ONLY || mutationInFlight.current) return false;
    if (!target || target.tripId !== currentTripId) { showAlert('여행을 다시 열어 주세요.', 'error'); return false; }
    mutationInFlight.current = true;
    setIsBusy(true); setBusyMessage('변경 내용을 저장 중입니다...');
    try {
      await requestTripAction(user, shareCode, { action, ...payload, tripId: target.tripId, expectedVersion: target.version });
      return true;
    } catch (error) { console.error('Trip save failed:', error.message); showAlert(error.message, 'error'); return false; }
    finally { mutationInFlight.current = false; setIsBusy(false); setBusyMessage(''); }
  };

  const openItem = (dayId, item, index = 0) => {
    if (IS_READ_ONLY || mutationInFlight.current) return;
    editingTarget.current = { tripId: currentTripId, version: versionOf(tripData) };
    const identity = item ? (item.id ?? ('legacy-' + dayId + '-' + index)) : crypto.randomUUID();
    setEditingItem({ ...(item || { time: dayId === 'preparation' ? '-' : '10:00', title: '', type: 'activity', cost: 0, paymentMethod: 'card' }), id: identity, dayId, isNew: !item });
    setIsModalOpen(true);
  };

  const openConfig = () => {
    if (IS_READ_ONLY || mutationInFlight.current) return;
    editingTarget.current = { tripId: currentTripId, version: versionOf(tripData) };
    setEditingConfig({ ...tripData.config }); setIsConfigModalOpen(true);
  };

  const handleDownloadExcel = async () => {
    if (!tripData || isBusy || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setIsBusy(true); setBusyMessage('엑셀 파일을 만드는 중입니다...');
    try {
      const { downloadTripExcel } = await import('./exportTrip.js');
      await downloadTripExcel(tripData);
    } catch (error) {
      console.error('Excel download failed:', error);
      showAlert('엑셀 다운로드 실패: ' + error.message, 'error');
    } finally { mutationInFlight.current = false; setIsBusy(false); setBusyMessage(''); }
  };

  const beginHotelEdit = day => {
    if (IS_READ_ONLY || mutationInFlight.current) return;
    setHotelDraft(previous => previous?.tripId === currentTripId && previous.dayId === day.id ? previous : { tripId: currentTripId, dayId: day.id, value: day.hotel || '', original: day.hotel || '', version: versionOf(tripData) });
  };
  const handleHotelSave = async dayId => {
    if (!hotelDraft || hotelDraft.tripId !== currentTripId || hotelDraft.dayId !== dayId || hotelDraft.value === hotelDraft.original) return;
    const saved = await saveMutation('saveHotel', { dayId, hotel: hotelDraft.value }, { tripId: hotelDraft.tripId, version: hotelDraft.version });
    if (saved) setHotelDraft(null);
  };
  const handleSaveConfig = async () => {
    if (await saveMutation('saveConfig', { config: editingConfig }, editingTarget.current)) setIsConfigModalOpen(false);
  };
  const saveItem = async () => {
    if (!editingItem) return;
    const saved = await saveMutation('saveItem', { dayId: editingItem.dayId, itemId: editingItem.id, isNew: editingItem.isNew, item: editingItem }, editingTarget.current);
    if (saved) { setIsModalOpen(false); setEditingItem(null); }
  };

  // --- Render ---
  const commonUIProps = { isBusy, busyMessage, confirmDialog, setConfirmDialog, alertInfo, setAlertInfo };

  if (isLoginStep) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-blue-500 to-indigo-600 overflow-y-auto">
        <div className="min-h-full flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm text-center">
                <div className="bg-blue-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-6"><Users className="text-blue-600 w-8 h-8" /></div>
                <h1 className="text-2xl font-bold text-gray-800 mb-2">여행 공유 시작하기</h1>
                <p className="text-gray-500 mb-6 text-sm">가족이나 친구와 함께 공유할<br/>고유 코드를 입력해주세요.</p>
                <input type="text" value={inputShareCode} onChange={(e) => setInputShareCode(e.target.value)} placeholder="예: 우리가족여행2026" className="w-full border border-gray-300 bg-white text-gray-900 rounded-xl p-4 text-center text-lg font-bold mb-4 focus:ring-2 focus:ring-blue-500 outline-none uppercase" />
                <button onClick={handleLogin} className="w-full bg-blue-600 text-white py-4 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg">입장하기</button>
            </div>
            {alertInfo && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-gray-800 text-white px-4 py-2 rounded-lg shadow-lg text-sm flex items-center gap-2 z-[80]"><AlertCircle size={16} /> {alertInfo.message}<button onClick={() => setAlertInfo(null)} className="ml-2"><X size={14}/></button></div>}
        </div>
      </div>
    );
  }

  if (view === 'new') {
      return (
        <CommonUI {...commonUIProps}>
            <div className="flex items-center justify-center p-4 min-h-[80vh]">
                <div className="bg-white w-full max-w-md p-8 rounded-2xl shadow-lg">
                    <h2 className="text-xl font-bold mb-6 text-gray-900">새 여행 계획</h2>
                    <div className="space-y-4">
                        <div>
                            {/* FIX: 라벨 색상과 폰트 굵기 강화 */}
                            <label className="block text-sm font-extrabold text-gray-900 mb-1">여행 국가</label>
                            <input type="text" className="w-full border border-gray-300 bg-white text-gray-900 p-3 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="예: 태국" value={newTripConfig.country} onChange={e => setNewTripConfig({...newTripConfig, country: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-extrabold text-gray-900 mb-1">시작 날짜</label>
                            <input type="date" className="w-full border border-gray-300 bg-white text-gray-900 p-3 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" value={newTripConfig.startDate} onChange={e => setNewTripConfig({...newTripConfig, startDate: e.target.value})} />
                        </div>
                        <div className="flex gap-4">
                            <div className="flex-1">
                                <label className="block text-sm font-extrabold text-gray-900 mb-1">기간 (일)</label>
                                <input type="number" className="w-full border border-gray-300 bg-white text-gray-900 p-3 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="예: 3" value={newTripConfig.duration} onChange={e => setNewTripConfig({...newTripConfig, duration: Number(e.target.value)})} />
                            </div>
                            <div className="flex-1">
                                <label className="block text-sm font-extrabold text-gray-900 mb-1">환율 (1단위당)</label>
                                <input type="number" className="w-full border border-gray-300 bg-white text-gray-900 p-3 rounded-lg outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="예: 37" value={newTripConfig.currencyRate} onChange={e => setNewTripConfig({...newTripConfig, currencyRate: Number(e.target.value)})} />
                            </div>
                        </div>
                        <div className="pt-4 flex flex-col gap-3">
                            <div className="flex gap-3">
                                <button onClick={() => setView('list')} className="flex-1 py-3 bg-gray-100 rounded-xl font-bold text-gray-600 hover:bg-gray-200">취소</button>
                                <button onClick={handleCreateTrip} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-sm">여행 만들기</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </CommonUI>
      );
  }

  if (view === 'detail' && !tripData) {
    return <CommonUI {...commonUIProps}><div role="status" className="p-10 text-center"><Loader2 className="mx-auto animate-spin" />여행을 불러오는 중입니다.<button onClick={() => setView('list')} className="block mx-auto mt-4 text-blue-600">목록</button></div></CommonUI>;
  }

  if (view === 'detail' && tripData) {
    const { config, days, preparation } = tripData;
    const totalCost = getTripTotalCost(tripData);
    const activeDay = selectedDay === 'preparation' ? 'preparation' : (days.find(day => day.id === selectedDay)?.id ?? days[0]?.id ?? 'preparation');
    const sumSchedule = schedule => (schedule || []).reduce((sum, item) => sum + (Number(item.cost) || 0), 0);
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
          {IS_READ_ONLY && <p className="text-sm text-gray-500">자료 열람 모드 · 기존 일정과 비용을 확인할 수 있습니다.</p>}
          <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200 relative">
             <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-600 items-center">
                 <span className="flex items-center gap-1"><Calendar size={14}/> {config.startDate}</span>
                 <span className="flex items-center gap-1"><Clock size={14}/> {config.duration}일간</span>
                 <span className="flex items-center gap-1 text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded"><Calculator size={14}/> 환율 {config.currencyRate}원</span>
                 <span className="flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100"><Wallet size={14}/> {formatCurrency(totalCost)}원</span>
             </div>
             <button disabled={IS_READ_ONLY} title={IS_READ_ONLY ? '자료 열람 모드' : '설정 수정'} onClick={openConfig} className="absolute top-4 right-4 p-1 text-gray-400 hover:text-blue-600"><Settings size={20}/></button>
             <button disabled={isBusy} onClick={handleDownloadExcel} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100"><Download size={16}/> 엑셀 다운로드</button>
             <button disabled={IS_READ_ONLY || isBusy} onClick={() => setIsImportOpen(true)} className="mt-4 ml-2 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"><Plus size={16}/> 자료로 일정 추가</button>
          </div>
          <nav aria-label="여행 날짜 선택" className="flex gap-2 overflow-x-auto pb-2">
            <button type="button" disabled={isBusy} aria-pressed={activeDay === 'preparation'} onClick={() => setSelectedDay('preparation')} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${activeDay === 'preparation' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 border border-gray-300'}`}>준비</button>
            {days.map(day => <button type="button" key={day.id} disabled={isBusy} aria-pressed={activeDay === day.id} onClick={() => setSelectedDay(day.id)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${activeDay === day.id ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border border-gray-300'}`}>Day {day.dayNum}</button>)}
          </nav>
          <div className="space-y-6">
            {activeDay === 'preparation' && (
            <div className="bg-white rounded-xl shadow-sm border border-indigo-100 overflow-hidden ring-1 ring-indigo-50">
                <div className="bg-indigo-50 p-4 border-b border-indigo-100 flex justify-between items-center">
                    <span className="bg-indigo-600 text-white text-sm font-bold px-3 py-1 rounded-full">Day 0 (준비)</span>
                    <span className="text-sm font-bold text-gray-700">준비 비용 {formatCurrency(sumSchedule(preparation?.schedule))}원</span>
                    <div className="flex gap-2">
                        {/* FIX: id: Date.now() 추가 */}
                        <button disabled={IS_READ_ONLY || isBusy} title={IS_READ_ONLY ? '자료 열람 모드' : undefined} onClick={() => openItem('preparation')} className="text-sm text-indigo-700 font-bold flex items-center gap-1 hover:text-indigo-800"><Plus size={16}/> 준비 항목 추가</button>
                    </div>
                </div>
                <div className="divide-y divide-gray-100">
                    {preparation?.schedule?.map((item, index) => (
                         <div key={item.id ?? ('legacy-preparation-' + index)} role={!IS_READ_ONLY ? 'button' : undefined} tabIndex={!IS_READ_ONLY ? 0 : undefined} aria-label={!IS_READ_ONLY ? `${item.title} 수정` : undefined} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openItem('preparation', item, index); } }} onClick={() => openItem('preparation', item, index)} className="p-4 hover:bg-indigo-50 cursor-pointer flex items-center gap-4">
                            <div className="flex-1">
                                <div className="flex flex-wrap items-center gap-2 font-medium text-gray-800">
                                    {getCategoryIcon(item.type)} {item.title}
                                    {(item.cost > 0 || item.paymentMethod) && (
                                         <div className="text-xs text-gray-500 flex items-center gap-1.5 bg-gray-50 px-2 py-0.5 rounded">
                                            {item.paymentMethod === 'cash' ? <Banknote size={12}/> : item.paymentMethod === 'other' ? <Wallet size={12}/> : <CreditCard size={12}/>} 
                                            <span className="font-medium">{item.paymentMethod === 'cash' ? '현금' : item.paymentMethod === 'other' ? '기타' : '카드'}</span>
                                            {item.paymentDetail && <span className="text-gray-400">| {item.paymentDetail}</span>}
                                         </div>
                                    )}
                                </div>
                                {item.memo && <div className="text-xs text-gray-400 mt-1 pl-6 whitespace-pre-wrap">{item.memo}</div>}
                            </div>
                            <div className="text-right whitespace-nowrap">{item.cost > 0 ? <span className="font-bold text-gray-900">{formatCurrency(item.cost)}원</span> : <span className="text-xs text-gray-600">비용 입력</span>}</div>{!IS_READ_ONLY && <Pencil aria-hidden="true" size={15} className="text-gray-500 shrink-0"/>}
                        </div>
                    ))}
                    {(!preparation?.schedule || preparation.schedule.length === 0) && <div className="p-8 text-center text-gray-400 text-sm">준비 내역을 기록하세요.</div>}
                </div>
            </div>
            )}
            {days.map((day, idx) => activeDay === day.id && (
                <div key={day.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="bg-gray-50 p-4 border-b border-gray-200 flex flex-wrap justify-between items-center gap-2">
                    <div className="flex items-center gap-2">
                        <span className="bg-blue-100 text-blue-800 text-sm font-bold px-3 py-1 rounded-full">Day {day.dayNum}</span>
                        <span className="text-gray-500 text-sm">{getFormattedDate(config.startDate, idx)}</span>
                        <input type="text" placeholder="숙소 입력" readOnly={IS_READ_ONLY} value={hotelDraft?.tripId === currentTripId && hotelDraft.dayId === day.id ? hotelDraft.value : (day.hotel || '')} onFocus={() => beginHotelEdit(day)} onChange={e => setHotelDraft(previous => previous ? { ...previous, value: e.target.value } : previous)} onBlur={() => handleHotelSave(day.id)} className="bg-white border border-gray-200 text-gray-900 rounded px-2 py-1 text-sm w-32 md:w-48 ml-2 focus:ring-2 focus:ring-blue-500 outline-none"/>
                    </div>
                    <span className="text-sm font-bold text-gray-700">지출 {formatCurrency(Math.floor(sumSchedule(day.schedule) * config.currencyRate))}원</span>
                    {/* FIX: id: Date.now() 추가 */}
                    <button disabled={IS_READ_ONLY || isBusy} title={IS_READ_ONLY ? '자료 열람 모드' : undefined} onClick={() => openItem(day.id)} className="text-sm text-blue-700 font-bold flex items-center gap-1 hover:text-blue-800"><Plus size={16}/> 일정 추가</button>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {day.schedule.map((item, index) => (
                      <div key={item.id ?? ('legacy-' + day.id + '-' + index)} role={!IS_READ_ONLY ? 'button' : undefined} tabIndex={!IS_READ_ONLY ? 0 : undefined} aria-label={!IS_READ_ONLY ? `${item.title} 수정` : undefined} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openItem(day.id, item, index); } }} onClick={() => openItem(day.id, item, index)} className="p-4 hover:bg-blue-50 cursor-pointer flex items-center gap-4">
                        <div className="w-16 text-sm font-mono text-gray-500 font-medium">{item.time}</div>
                        <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-2 font-medium text-gray-800">
                                {getCategoryIcon(item.type)} {item.title}
                                {(item.cost > 0 || item.paymentMethod) && (
                                    <div className="text-xs text-gray-500 flex items-center gap-1.5 bg-gray-50 px-2 py-0.5 rounded">
                                    {item.paymentMethod === 'cash' ? <Banknote size={12}/> : item.paymentMethod === 'other' ? <Wallet size={12}/> : <CreditCard size={12}/>} 
                                    <span className="font-medium">{item.paymentMethod === 'cash' ? '현금' : item.paymentMethod === 'other' ? '기타' : '카드'}</span>
                                    {item.paymentDetail && <span className="text-gray-400">| {item.paymentDetail}</span>}
                                    </div>
                                )}
                            </div>
                            {item.memo && <div className="text-xs text-gray-400 mt-1 pl-6 whitespace-pre-wrap">{item.memo}</div>}
                        </div>
                        <div className="text-right whitespace-nowrap">
                            {item.cost > 0 ? (
                                <div className="flex flex-col items-end">
                                    <span className="font-bold text-gray-900">{formatCurrency(item.cost)} <span className="text-xs font-normal text-gray-500">Local</span></span>
                                    <span className="text-xs text-blue-600 font-medium">≈ {formatCurrency(Math.floor(item.cost * config.currencyRate))} 원</span>
                                </div>
                            ) : <span className="text-xs text-gray-600">비용 입력</span>}
                        </div>
                        {!IS_READ_ONLY && <Pencil aria-hidden="true" size={15} className="text-gray-500 shrink-0"/>}
                      </div>
                    ))}
                    {day.schedule.length === 0 && <div className="p-8 text-center text-sm text-gray-600">아직 등록된 일정이 없습니다.{!IS_READ_ONLY && <button disabled={isBusy} onClick={() => openItem(day.id)} className="block mx-auto mt-3 rounded-lg bg-blue-600 px-4 py-2 font-bold text-white"><Plus size={16} className="inline mr-1"/>일정 추가</button>}</div>}
                  </div>
                </div>
            ))}
          </div>
          <p className="text-xs text-gray-600">일별 지출은 해당 날짜의 현지 비용 합계에 환율을 적용해 원 미만을 버립니다. 전체 합계와 원 단위 차이가 날 수 있습니다.</p>
          <button disabled={isBusy} onClick={handleDownloadExcel} className="w-full mt-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-3 mb-8 hover:shadow-xl hover:scale-[1.01] transition-all">
            <Download size={24} /> 엑셀 다운로드
          </button>
        </main>

        {isImportOpen && <ImportDialog trip={tripData} tripId={currentTripId} user={user} shareCode={shareCode} onClose={() => setIsImportOpen(false)} onSaved={count => showAlert(`${count}개 항목을 저장했습니다.`)}/>}
        {isModalOpen && editingItem && (
            <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto flex items-center justify-center p-4 print:hidden animate-fade-in-up">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4 my-8 relative">
                    <h3 className="font-bold text-lg text-gray-800 mb-4">{editingItem.dayId === 'preparation' ? '준비 항목' : '일정 상세'}</h3>
                    
                    {/* Category Selection */}
                    <div>
                        <label className="text-xs font-bold text-gray-500 mb-2 block">카테고리 (아이콘)</label>
                        <div className="flex flex-wrap gap-2">
                            {CATEGORIES.map((cat) => (
                                <button
                                    key={cat.id}
                                    onClick={() => setEditingItem({...editingItem, type: cat.id})}
                                    className={`flex flex-col items-center justify-center p-2 rounded-lg border transition-all w-14 h-14 ${editingItem.type === cat.id ? `border-${cat.color.split('-')[1]}-500 ${cat.bg} ring-1 ring-${cat.color.split('-')[1]}-500` : 'border-gray-200 hover:bg-gray-50'}`}
                                >
                                    <cat.icon size={20} className={editingItem.type === cat.id ? cat.color : 'text-gray-400'} />
                                    <span className={`text-[10px] mt-1 ${editingItem.type === cat.id ? 'font-bold text-gray-700' : 'text-gray-400'}`}>{cat.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>

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
                        <button disabled title="항목 삭제는 아직 지원하지 않습니다." className="text-red-500 p-2 hover:bg-red-50 rounded-lg transition"><Trash2/></button>
                        <div className="flex gap-2">
                            <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition">취소</button>
                            <button onClick={saveItem} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition shadow-md">저장</button>
                        </div>
                    </div>
                </div>
            </div>
        )}

        {isConfigModalOpen && editingConfig && (
             <div className="fixed inset-0 bg-black/50 z-50 overflow-y-auto flex items-center justify-center p-4 print:hidden animate-fade-in-up">
                <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-4 my-8 relative">
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
            <button disabled={IS_READ_ONLY || isBusy} title={IS_READ_ONLY ? '자료 열람 모드' : undefined} onClick={() => { newTripRequest.current = null; setNewTripConfig({ country: '', startDate: new Date().toLocaleDateString('sv-SE'), duration: 3, currencyRate: 1 }); setView('new'); }} className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 shadow-sm flex items-center gap-2">
              <Plus size={18} /> 새 여행
            </button>
          </header>

          {IS_READ_ONLY && <p className="text-sm text-gray-500">자료 열람 모드 · 기존 일정과 비용을 확인할 수 있습니다.</p>}
          <div className="grid gap-4">
            {listError ? (
                <div role="alert" className="bg-white p-10 rounded-xl border border-dashed border-gray-300 text-center text-gray-600">
                    <AlertCircle className="w-12 h-12 mx-auto mb-2 text-red-400" />
                    <p className="font-bold text-gray-800">여행 목록을 불러오지 못했습니다.</p>
                    <p className="mt-2 text-sm">{authError ? 'Firebase 로그인에 실패했습니다.' : '데이터가 없는 것이 아니라 조회에 실패한 상태입니다.'}</p>
                    <p className="mt-2 text-xs break-words">{listError.code || 'unknown'}: {listError.message}</p>
                    <button onClick={() => window.location.reload()} className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700">다시 시도</button>
                </div>
            ) : isTripsLoading ? (
                <div role="status" className="bg-white p-10 rounded-xl border border-dashed border-gray-300 text-center text-gray-400">
                    <Loader2 className="w-12 h-12 mx-auto mb-2 animate-spin" />
                    <p>여행 목록을 불러오는 중입니다.</p>
                </div>
            ) : trips.length === 0 ? (
                <div className="bg-white p-10 rounded-xl border border-dashed border-gray-300 text-center text-gray-400">
                    <MapPin className="w-12 h-12 mx-auto mb-2 opacity-20" />
                    <p>공유된 여행이 없습니다.<br/>새로운 여행을 만들어보세요!</p>
                </div>
            ) : trips.map(trip => (
                <div key={trip.id} onClick={() => { setSelectedDay(null); setHotelDraft(null); setTripData(trip); setCurrentTripId(trip.id); setView('detail'); }} className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 hover:shadow-md cursor-pointer relative group transition-all">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="text-xl font-bold text-gray-800">{trip.config.country}</h3>
                            <div className="flex items-center gap-2 text-sm text-gray-500 mt-1"><Calendar size={14} /> {trip.config.startDate} ({trip.config.duration}일)</div>
                        </div>
                        <div className="text-right">
                            <span className="text-lg font-bold text-blue-600">{formatCurrency(getTripTotalCost(trip))} 원</span>
                        </div>
                    </div>
                    <button disabled title="여행 삭제는 아직 지원하지 않습니다." onClick={handleDeleteTripClick} className="absolute bottom-4 right-4 text-gray-300 hover:text-red-500 p-2 z-10 transition-colors"><Trash2 size={16}/></button>
                </div>
            ))}
          </div>
        </div>
      </CommonUI>
    );
};

export default TravelPlanner;
