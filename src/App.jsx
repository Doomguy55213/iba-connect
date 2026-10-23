import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Users, Calendar, Plus, UserPlus, RefreshCw, MapPin, Tag, ShieldAlert, LogOut, Car, MessageCircle } from 'lucide-react';

const CATEGORIES = ['Sports & Rec', 'Study & Homework', 'Food & Coffee', 'Casual Hangout'];

export default function App() {
  // User Profile State
  const [currentUser, setCurrentUser] = useState(null);
  const [nameInput, setNameInput] = useState('');
  const [contactInput, setContactInput] = useState('');

  // Tab & UI State
  const [activeTab, setActiveTab] = useState('events'); // 'events' | 'matching' | 'lostfound' | 'carpool'
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLostFoundModal, setShowLostFoundModal] = useState(false);
  const [showCarpoolModal, setShowCarpoolModal] = useState(false);

  // Events State
  const [events, setEvents] = useState([]);
  const [newEvent, setNewEvent] = useState({
    title: '',
    location: '',
    category: CATEGORIES[0],
    capacity: 4
  });

  // Matching State
  const [matchCategory, setMatchCategory] = useState(CATEGORIES[0]);
  const [matchingStatus, setMatchingStatus] = useState('idle'); // 'idle' | 'searching' | 'matched'
  const [matchedPartner, setMatchedPartner] = useState(null);
  const [queueRecordId, setQueueRecordId] = useState(null);

  // Lost & Found State
  const [lostFoundItems, setLostFoundItems] = useState([]);
  const [newItem, setNewItem] = useState({
    item_title: '',
    description: '',
    location: '',
    status: 'LOST',
    image_url: ''
  });

  // Carpool State
  const [carpools, setCarpools] = useState([]);
  const [newCarpool, setNewCarpool] = useState({
    type: 'OFFER', // 'OFFER' or 'REQUEST'
    origin: 'IBA Main Campus',
    destination: '',
    departure_time: '',
    available_seats: 3,
    cost_notes: ''
  });

  // Load User Profile on Mount
  useEffect(() => {
    const savedUser = localStorage.getItem('campus_user');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
    }
    fetchEvents();
    fetchLostFound();
    fetchCarpools();
  }, []);

  // Poll for 1-on-1 Matches when searching
  useEffect(() => {
    let interval = null;
    if (matchingStatus === 'searching' && queueRecordId) {
      interval = setInterval(async () => {
        await checkQueueForMatch();
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [matchingStatus, queueRecordId]);

  // Save User Info
  const handleSaveUser = (e) => {
    e.preventDefault();
    if (!nameInput.trim() || !contactInput.trim()) return;
    const user = { name: nameInput.trim(), contact: contactInput.trim() };
    localStorage.setItem('campus_user', JSON.stringify(user));
    setCurrentUser(user);
  };

  // Sign Out Handler
  const handleSignOut = () => {
    localStorage.removeItem('campus_user');
    setCurrentUser(null);
    setNameInput('');
    setContactInput('');
  };

  // Fetch Events
  const fetchEvents = async () => {
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setEvents(data);
    }
  };

  // Fetch Lost & Found Items
  const fetchLostFound = async () => {
    const { data, error } = await supabase
      .from('lost_found')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setLostFoundItems(data);
    }
  };

  // Fetch Carpools
  const fetchCarpools = async () => {
    const { data, error } = await supabase
      .from('carpools')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setCarpools(data);
    }
  };

  // Create Event (FIXED WITH ERROR FEEDBACK)
  const handleCreateEvent = async (e) => {
    e.preventDefault();
    
    if (!newEvent.title.trim() || !newEvent.location.trim()) {
      alert('Please fill out both the Activity Title and Campus Location.');
      return;
    }

    const payload = {
      creator_name: currentUser?.name || 'Anonymous Student',
      contact_handle: currentUser?.contact || 'N/A',
      title: newEvent.title.trim(),
      location: newEvent.location.trim(),
      category: newEvent.category || CATEGORIES[0],
      capacity: parseInt(newEvent.capacity, 10) || 4,
      joined_count: 1
    };

    const { error } = await supabase.from('events').insert([payload]);

    if (error) {
      console.error('Supabase Error:', error);
      alert(`Failed to publish event: ${error.message}`);
    } else {
      setShowCreateModal(false);
      setNewEvent({ title: '', location: '', category: CATEGORIES[0], capacity: 4 });
      fetchEvents();
    }
  };

  // Report Lost/Found Item
  const handleReportItem = async (e) => {
    e.preventDefault();
    if (!newItem.item_title.trim() || !newItem.location.trim()) {
      alert('Please fill out the Item Title and Location.');
      return;
    }

    const payload = {
      reporter_name: currentUser?.name || 'Anonymous Student',
      contact_handle: currentUser?.contact || 'N/A',
      item_title: newItem.item_title.trim(),
      description: newItem.description.trim(),
      location: newItem.location.trim(),
      status: newItem.status,
      image_url: newItem.image_url.trim()
    };

    const { error } = await supabase.from('lost_found').insert([payload]);

    if (error) {
      console.error('Supabase Error:', error);
      alert(`Failed to post item: ${error.message}`);
    } else {
      setShowLostFoundModal(false);
      setNewItem({ item_title: '', description: '', location: '', status: 'LOST', image_url: '' });
      fetchLostFound();
    }
  };

  // Create Carpool Offer/Request (FIXED WITH ERROR FEEDBACK)
  const handleCreateCarpool = async (e) => {
    e.preventDefault();
    if (!newCarpool.destination.trim() || !newCarpool.departure_time.trim()) {
      alert('Please fill out both Destination and Departure Time.');
      return;
    }

    const payload = {
      creator_name: currentUser?.name || 'Anonymous Student',
      contact_handle: currentUser?.contact || 'N/A',
      type: newCarpool.type,
      origin: newCarpool.origin.trim() || 'IBA Main Campus',
      destination: newCarpool.destination.trim(),
      departure_time: newCarpool.departure_time.trim(),
      available_seats: parseInt(newCarpool.available_seats, 10) || 1,
      joined_count: 0,
      cost_notes: newCarpool.cost_notes.trim()
    };

    const { error } = await supabase.from('carpools').insert([payload]);

    if (error) {
      console.error('Supabase Error:', error);
      alert(`Failed to post carpool: ${error.message}`);
    } else {
      setShowCarpoolModal(false);
      setNewCarpool({
        type: 'OFFER',
        origin: 'IBA Main Campus',
        destination: '',
        departure_time: '',
        available_seats: 3,
        cost_notes: ''
      });
      fetchCarpools();
    }
  };

  // Join Event
  const handleJoinEvent = async (event) => {
    if (event.joined_count >= event.capacity) return;

    const { error } = await supabase
      .from('events')
      .update({ joined_count: event.joined_count + 1 })
      .eq('id', event.id);

    if (!error) {
      fetchEvents();
    }
  };

  // Claim Carpool Seat
  const handleClaimCarpoolSeat = async (ride) => {
    if (ride.joined_count >= ride.available_seats) return;

    const { error } = await supabase
      .from('carpools')
      .update({ joined_count: ride.joined_count + 1 })
      .eq('id', ride.id);

    if (!error) {
      fetchCarpools();
    }
  };

  // Start 1-on-1 Search
  const startMatchingSearch = async () => {
    setMatchingStatus('searching');
    setMatchedPartner(null);

    const { data, error } = await supabase
      .from('hangout_queue')
      .insert([
        {
          user_name: currentUser.name,
          contact_handle: currentUser.contact,
          category: matchCategory,
          status: 'searching'
        }
      ])
      .select();

    if (!error && data && data.length > 0) {
      setQueueRecordId(data[0].id);
    }
  };

  // Check queue for partner
  const checkQueueForMatch = async () => {
    if (!queueRecordId || !currentUser) return;

    const { data: myRecord } = await supabase
      .from('hangout_queue')
      .select('*')
      .eq('id', queueRecordId)
      .single();

    if (myRecord && myRecord.status === 'matched') {
      setMatchedPartner({
        name: myRecord.matched_user_name,
        contact: myRecord.matched_contact
      });
      setMatchingStatus('matched');
      return;
    }

    const { data: availablePartners } = await supabase
      .from('hangout_queue')
      .select('*')
      .eq('category', matchCategory)
      .eq('status', 'searching')
      .neq('id', queueRecordId)
      .limit(1);

    if (availablePartners && availablePartners.length > 0) {
      const partner = availablePartners[0];

      await supabase
        .from('hangout_queue')
        .update({
          status: 'matched',
          matched_user_name: currentUser.name,
          matched_contact: currentUser.contact
        })
        .eq('id', partner.id);

      await supabase
        .from('hangout_queue')
        .update({ status: 'matched' })
        .eq('id', queueRecordId);

      setMatchedPartner({
        name: partner.user_name,
        contact: partner.contact_handle
      });
      setMatchingStatus('matched');
    }
  };

  // Cancel Search
  const cancelSearch = async () => {
    if (queueRecordId) {
      await supabase.from('hangout_queue').delete().eq('id', queueRecordId);
    }
    setMatchingStatus('idle');
    setQueueRecordId(null);
  };

  // Onboarding Screen
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#DA291C] text-slate-900 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-3xl max-w-md w-full border-4 border-[#FFC72C] shadow-2xl">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-black tracking-tight text-[#DA291C] uppercase">IBA Connect</h1>
            <p className="text-slate-600 text-xs font-bold mt-1">Enter your details to start hosting or joining campus events.</p>
          </div>
          <form onSubmit={handleSaveUser} className="space-y-4">
            <div>
              <label className="text-xs text-[#DA291C] font-black uppercase tracking-wider block mb-1">Your Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Alex Smith"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#DA291C] transition font-bold"
              />
            </div>
            <div>
              <label className="text-xs text-[#DA291C] font-black uppercase tracking-wider block mb-1">Contact Handle / WhatsApp</label>
              <input
                type="text"
                required
                placeholder="e.g. 03001234567 or @alex_smith"
                value={contactInput}
                onChange={(e) => setContactInput(e.target.value)}
                className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-3 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-[#DA291C] transition font-bold"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-[#DA291C] hover:bg-[#b81f15] text-[#FFC72C] font-black p-3.5 rounded-2xl transition shadow-lg uppercase tracking-wide text-sm border-2 border-[#FFC72C]"
            >
              Continue to IBA Connect Feed
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col max-w-lg mx-auto border-x-2 border-slate-300 shadow-2xl">
      {/* Header */}
      <header className="p-4 border-b-4 border-[#FFC72C] flex justify-between items-center bg-[#DA291C] text-white sticky top-0 z-10 shadow-md">
        <div>
          <h1 className="font-black text-2xl tracking-wide text-[#FFC72C] uppercase">IBA Connect</h1>
          <p className="text-xs text-white font-bold">Signed in as <span className="underline font-black text-[#FFC72C]">{currentUser.name}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (activeTab === 'lostfound') setShowLostFoundModal(true);
              else if (activeTab === 'carpool') setShowCarpoolModal(true);
              else setShowCreateModal(true);
            }}
            className="bg-[#FFC72C] hover:bg-amber-400 p-2 rounded-full text-[#DA291C] transition shadow-md border-2 border-white"
            title="Create Post"
          >
            <Plus size={22} className="stroke-[3]" />
          </button>
          <button
            onClick={handleSignOut}
            className="bg-white/20 hover:bg-white/30 p-2 rounded-full text-white transition shadow-md border border-white/40"
            title="Sign Out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="flex border-b-2 border-slate-200 bg-white">
        <button
          onClick={() => setActiveTab('events')}
          className={`flex-1 py-3 text-[11px] font-black flex items-center justify-center gap-1 border-b-4 transition ${
            activeTab === 'events' ? 'border-[#DA291C] text-[#DA291C] bg-amber-50' : 'border-transparent text-slate-500 hover:text-[#DA291C]'
          }`}
        >
          <Calendar size={14} />
          Events
        </button>
        <button
          onClick={() => setActiveTab('carpool')}
          className={`flex-1 py-3 text-[11px] font-black flex items-center justify-center gap-1 border-b-4 transition ${
            activeTab === 'carpool' ? 'border-[#DA291C] text-[#DA291C] bg-amber-50' : 'border-transparent text-slate-500 hover:text-[#DA291C]'
          }`}
        >
          <Car size={14} />
          Carpool
        </button>
        <button
          onClick={() => setActiveTab('matching')}
          className={`flex-1 py-3 text-[11px] font-black flex items-center justify-center gap-1 border-b-4 transition ${
            activeTab === 'matching' ? 'border-[#DA291C] text-[#DA291C] bg-amber-50' : 'border-transparent text-slate-500 hover:text-[#DA291C]'
          }`}
        >
          <UserPlus size={14} />
          1-on-1
        </button>
        <button
          onClick={() => setActiveTab('lostfound')}
          className={`flex-1 py-3 text-[11px] font-black flex items-center justify-center gap-1 border-b-4 transition ${
            activeTab === 'lostfound' ? 'border-[#DA291C] text-[#DA291C] bg-amber-50' : 'border-transparent text-slate-500 hover:text-[#DA291C]'
          }`}
        >
          <ShieldAlert size={14} />
          Lost/Found
        </button>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-4 overflow-y-auto">
        {activeTab === 'events' && (
          /* TAB 1: GROUP EVENTS FEED */
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-black text-[#DA291C] uppercase tracking-widest">Active Campus Events</h2>
              <button onClick={fetchEvents} className="text-xs text-[#DA291C] flex items-center gap-1 hover:underline font-black">
                <RefreshCw size={12} /> Refresh
              </button>
            </div>

            {events.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-3xl border-2 border-dashed border-amber-300 p-6 shadow-sm">
                <p className="text-[#DA291C] font-black text-base">No active events right now.</p>
                <p className="text-slate-500 text-xs font-bold mt-1">Be the first to host one by tapping the plus button above!</p>
              </div>
            ) : (
              events.map((event) => {
                const isFull = event.joined_count >= event.capacity;
                return (
                  <div key={event.id} className="bg-white border-2 border-amber-200 rounded-2xl p-4 space-y-3 shadow-sm hover:border-[#DA291C] transition">
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="font-extrabold text-slate-900 text-base leading-tight">{event.title}</h3>
                      <span className="text-[10px] px-2.5 py-1 rounded-full bg-[#FFC72C] text-[#DA291C] font-black flex items-center gap-1 shrink-0 border border-amber-300">
                        <Tag size={10} /> {event.category}
                      </span>
                    </div>

                    <div className="text-xs text-slate-700 font-bold space-y-1">
                      <p className="flex items-center gap-1.5"><MapPin size={14} className="text-[#DA291C] shrink-0" /> <span className="text-slate-900">{event.location}</span></p>
                      <p className="flex items-center gap-1.5"><Users size={14} className="text-[#DA291C] shrink-0" /> Host: {event.creator_name} ({event.contact_handle})</p>
                    </div>

                    <div className="flex justify-between items-center pt-2.5 border-t border-slate-100">
                      <span className="text-xs font-bold text-slate-600">
                        <strong className="text-[#DA291C] font-black text-sm">{event.joined_count}</strong> / {event.capacity} spots filled
                      </span>
                      <button
                        onClick={() => handleJoinEvent(event)}
                        disabled={isFull}
                        className={`text-xs px-4 py-2 rounded-xl font-black transition uppercase tracking-wide ${
                          isFull
                            ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                            : 'bg-[#DA291C] hover:bg-[#b81f15] text-[#FFC72C] shadow-sm border border-[#FFC72C]'
                        }`}
                      >
                        {isFull ? 'Event Full' : "I'm In!"}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'carpool' && (
          /* TAB 2: CARPOOL & RIDESHARE */
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-black text-[#DA291C] uppercase tracking-widest">IBA Rideshare & Carpool</h2>
              <button onClick={fetchCarpools} className="text-xs text-[#DA291C] flex items-center gap-1 hover:underline font-black">
                <RefreshCw size={12} /> Refresh
              </button>
            </div>

            {carpools.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-3xl border-2 border-dashed border-amber-300 p-6 shadow-sm">
                <p className="text-[#DA291C] font-black text-base">No carpools available right now.</p>
                <p className="text-slate-500 text-xs font-bold mt-1">Offer a ride or request one by tapping the plus button!</p>
              </div>
            ) : (
              carpools.map((ride) => {
                const isFull = ride.type === 'OFFER' && ride.joined_count >= ride.available_seats;
                const cleanPhone = ride.contact_handle.replace(/[^0-9]/g, '');

                return (
                  <div key={ride.id} className="bg-white border-2 border-amber-200 rounded-2xl p-4 space-y-3 shadow-sm hover:border-[#DA291C] transition">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider ${
                          ride.type === 'OFFER' ? 'bg-[#DA291C] text-[#FFC72C]' : 'bg-[#FFC72C] text-[#DA291C]'
                        }`}>
                          {ride.type === 'OFFER' ? 'Car Offered' : 'Ride Needed'}
                        </span>
                        <h3 className="font-extrabold text-slate-900 text-sm">{ride.origin} $\rightarrow$ {ride.destination}</h3>
                      </div>
                    </div>

                    <div className="text-xs text-slate-800 font-bold space-y-1.5 bg-amber-50/60 p-2.5 rounded-xl border border-amber-200">
                      <p className="flex items-center gap-1.5"><Calendar size={13} className="text-[#DA291C] shrink-0" /> Departure: <span className="font-black text-slate-900">{ride.departure_time}</span></p>
                      <p className="flex items-center gap-1.5"><Users size={13} className="text-[#DA291C] shrink-0" /> Posted by: <span className="font-black text-slate-900">{ride.creator_name}</span></p>
                      {ride.cost_notes && (
                        <p className="text-slate-600 italic text-[11px]">"{ride.cost_notes}"</p>
                      )}
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                      {ride.type === 'OFFER' ? (
                        <span className="text-xs font-bold text-slate-600">
                          <strong className="text-[#DA291C] font-black">{ride.available_seats - ride.joined_count}</strong> / {ride.available_seats} seats left
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500 font-bold">Seeking Ride</span>
                      )}

                      <div className="flex items-center gap-2">
                        {cleanPhone.length >= 10 && (
                          <a
                            href={`https://wa.me/${cleanPhone}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-xl font-black flex items-center gap-1 transition shadow-sm"
                          >
                            <MessageCircle size={14} /> Chat
                          </a>
                        )}

                        {ride.type === 'OFFER' && (
                          <button
                            onClick={() => handleClaimCarpoolSeat(ride)}
                            disabled={isFull}
                            className={`text-xs px-3 py-1.5 rounded-xl font-black transition uppercase tracking-wide ${
                              isFull
                                ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                                : 'bg-[#DA291C] hover:bg-[#b81f15] text-[#FFC72C] shadow-sm'
                            }`}
                          >
                            {isFull ? 'Full' : 'Claim Seat'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'matching' && (
          /* TAB 3: 1-ON-1 MATCHING */
          <div className="space-y-6 text-center py-6">
            <div>
              <h2 className="text-2xl font-black text-[#DA291C] mb-1 uppercase">Instant 1-on-1 Hangout</h2>
              <p className="text-xs font-bold text-slate-600">Match with someone free right now on campus.</p>
            </div>

            {matchingStatus === 'idle' && (
              <div className="bg-white border-2 border-amber-200 p-6 rounded-3xl space-y-4 max-w-xs mx-auto shadow-md">
                <label className="text-xs text-[#DA291C] font-black uppercase block text-left tracking-wider">Select Category</label>
                <select
                  value={matchCategory}
                  onChange={(e) => setMatchCategory(e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#DA291C]"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>

                <button
                  onClick={startMatchingSearch}
                  className="w-full bg-[#DA291C] hover:bg-[#b81f15] text-[#FFC72C] font-black text-sm py-3.5 rounded-2xl transition shadow-md uppercase tracking-wider border-2 border-[#FFC72C]"
                >
                  Find Partner Now
                </button>
              </div>
            )}

            {matchingStatus === 'searching' && (
              <div className="bg-white border-2 border-amber-200 p-8 rounded-3xl space-y-4 max-w-xs mx-auto shadow-md">
                <div className="animate-spin text-[#DA291C] inline-block">
                  <RefreshCw size={36} />
                </div>
                <p className="text-sm font-black text-slate-900">Searching for someone free for {matchCategory}...</p>
                <button
                  onClick={cancelSearch}
                  className="text-xs text-[#DA291C] hover:underline pt-2 block mx-auto font-black uppercase tracking-wider"
                >
                  Cancel Search
                </button>
              </div>
            )}

            {matchingStatus === 'matched' && matchedPartner && (
              <div className="bg-white border-4 border-[#FFC72C] p-6 rounded-3xl space-y-3 max-w-xs mx-auto shadow-xl">
                <h3 className="text-xl font-black text-[#DA291C] uppercase">Match Found! 🎉</h3>
                <div className="text-sm text-slate-800 font-bold">
                  <p className="font-extrabold text-base text-slate-900">{matchedPartner.name}</p>
                  <p className="text-xs text-slate-600 mt-1">Contact: <span className="text-[#DA291C] font-black underline">{matchedPartner.contact}</span></p>
                </div>
                <p className="text-xs font-bold text-slate-500 pt-2 border-t border-slate-100">
                  Reach out to agree on a campus meeting spot!
                </p>
                <button
                  onClick={() => setMatchingStatus('idle')}
                  className="w-full bg-[#DA291C] hover:bg-[#b81f15] text-xs py-2.5 rounded-xl text-[#FFC72C] font-black transition uppercase"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'lostfound' && (
          /* TAB 4: LOST AND FOUND */
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-black text-[#DA291C] uppercase tracking-widest">Campus Lost & Found Board</h2>
              <button onClick={fetchLostFound} className="text-xs text-[#DA291C] flex items-center gap-1 hover:underline font-black">
                <RefreshCw size={12} /> Refresh
              </button>
            </div>

            {lostFoundItems.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-3xl border-2 border-dashed border-amber-300 p-6 shadow-sm">
                <p className="text-[#DA291C] font-black text-base">No reported items.</p>
                <p className="text-slate-500 text-xs font-bold mt-1">Found or lost something? Tap the plus button to post!</p>
              </div>
            ) : (
              lostFoundItems.map((item) => (
                <div key={item.id} className="bg-white border-2 border-amber-200 rounded-2xl p-4 space-y-3 shadow-sm hover:border-[#DA291C] transition">
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="font-extrabold text-slate-900 text-base leading-tight">{item.item_title}</h3>
                    <span className={`text-[10px] px-2.5 py-1 rounded-full font-black uppercase tracking-wider text-white ${
                      item.status === 'LOST' ? 'bg-[#DA291C]' : 'bg-emerald-600'
                    }`}>
                      {item.status}
                    </span>
                  </div>

                  {item.description && (
                    <p className="text-xs text-slate-700 font-bold">{item.description}</p>
                  )}

                  {item.image_url && (
                    <img src={item.image_url} alt={item.item_title} className="w-full h-36 object-cover rounded-xl border border-slate-200" />
                  )}

                  <div className="text-xs text-slate-800 font-bold space-y-1 pt-1 border-t border-slate-100">
                    <p className="flex items-center gap-1.5"><MapPin size={14} className="text-[#DA291C] shrink-0" /> Location: <span className="font-extrabold">{item.location}</span></p>
                    <p className="flex items-center gap-1.5"><Users size={14} className="text-[#DA291C] shrink-0" /> Contact: <span className="font-black underline text-[#DA291C]">{item.reporter_name} ({item.contact_handle})</span></p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* CREATE CARPOOL MODAL */}
      {showCarpoolModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border-4 border-[#FFC72C] rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-xl font-black text-[#DA291C] uppercase">Post Carpool or Ride Request</h3>
            <form onSubmit={handleCreateCarpool} className="space-y-3">
              <div>
                <label className="text-xs text-[#DA291C] font-black uppercase block mb-1">Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNewCarpool({ ...newCarpool, type: 'OFFER' })}
                    className={`flex-1 py-2 rounded-xl font-black text-xs uppercase ${
                      newCarpool.type === 'OFFER' ? 'bg-[#DA291C] text-[#FFC72C]' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    I Have A Car (Offer)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCarpool({ ...newCarpool, type: 'REQUEST' })}
                    className={`flex-1 py-2 rounded-xl font-black text-xs uppercase ${
                      newCarpool.type === 'REQUEST' ? 'bg-[#FFC72C] text-[#DA291C]' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    Need A Ride (Request)
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-[#DA291C] font-black uppercase block mb-1">Pickup / Origin Location</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. IBA Main Campus / Gulshan-e-Iqbal"
                  value={newCarpool.origin}
                  onChange={(e) => setNewCarpool({ ...newCarpool, origin: e.target.value })}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#DA291C]"
                />
              </div>

              <div>
                <label className="text-xs text-[#DA291C] font-black uppercase block mb-1">Destination</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. IBA City Campus / PECHS / Nazimabad"
                  value={newCarpool.destination}
                  onChange={(e) => setNewCarpool({ ...newCarpool, destination: e.target.value })}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#DA291C]"
                />
              </div>

              <div>
                <label className="text-xs text-[#DA291C] font-black uppercase block mb-1">Departure Time</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Today @ 5:30 PM / Mon 8:30 AM"
                  value={newCarpool.departure_time}
                  onChange={(e) => setNewCarpool({ ...newCarpool, departure_time: e.target.value })}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#DA291C]"
                />
              </div>

              {newCarpool.type === 'OFFER' && (
                <div>
                  <label className="text-xs text-[#DA291C] font-black uppercase block mb-1">Available Seats</label>
                  <input
                    type="number"
                    min="1"
                    max="6"
                    value={newCarpool.available_seats}
                    onChange={(e) => setNewCarpool({ ...newCarpool, available_seats: e.target.value })}
                    className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#DA291C]"
                  />
                </div>
              )}

              <div>
                <label className="text-xs text-[#DA291C] font-black uppercase block mb-1">Fuel Contribution / Notes (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Fuel split 200 Rs / Free for IBA mates"
                  value={newCarpool.cost_notes}
                  onChange={(e) => setNewCarpool({ ...newCarpool, cost_notes: e.target.value })}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#DA291C]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCarpoolModal(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-sm py-2.5 rounded-xl text-slate-700 font-black transition uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#DA291C] hover:bg-[#b81f15] text-[#FFC72C] font-black text-sm py-2.5 rounded-xl transition shadow-md uppercase tracking-wider"
                >
                  Post Carpool
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE EVENT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border-4 border-[#FFC72C] rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-xl font-black text-[#DA291C] uppercase">Host a Campus Event</h3>
            <form onSubmit={handleCreateEvent} className="space-y-3">
              <div>
                <label className="text-xs text-[#DA291C] font-black uppercase block mb-1">Activity Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Badminton Doubles / C++ Study Session"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#DA291C]"
                />
              </div>

              <div>
                <label className="text-xs text-[#DA291C] font-black uppercase block mb-1">Campus Location</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rec Center Court 2, Student Centre Lawn"
                  value={newEvent.location}
                  onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#DA291C]"
                />
              </div>

              <div>
                <label className="text-xs text-[#DA291C] font-black uppercase block mb-1">Category</label>
                <select
                  value={newEvent.category}
                  onChange={(e) => setNewEvent({ ...newEvent, category: e.target.value })}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#DA291C]"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-[#DA291C] font-black uppercase block mb-1">Max Capacity</label>
                <input
                  type="number"
                  min="2"
                  max="20"
                  value={newEvent.capacity}
                  onChange={(e) => setNewEvent({ ...newEvent, capacity: e.target.value })}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#DA291C]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-sm py-2.5 rounded-xl text-slate-700 font-black transition uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#DA291C] hover:bg-[#b81f15] text-[#FFC72C] font-black text-sm py-2.5 rounded-xl transition shadow-md uppercase tracking-wider"
                >
                  Publish Event
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REPORT LOST & FOUND MODAL */}
      {showLostFoundModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border-4 border-[#FFC72C] rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-xl font-black text-[#DA291C] uppercase">Report Lost or Found Item</h3>
            <form onSubmit={handleReportItem} className="space-y-3">
              <div>
                <label className="text-xs text-[#DA291C] font-black uppercase block mb-1">Status</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNewItem({ ...newItem, status: 'LOST' })}
                    className={`flex-1 py-2 rounded-xl font-black text-xs uppercase ${
                      newItem.status === 'LOST' ? 'bg-[#DA291C] text-[#FFC72C]' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    I Lost Something
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewItem({ ...newItem, status: 'FOUND' })}
                    className={`flex-1 py-2 rounded-xl font-black text-xs uppercase ${
                      newItem.status === 'FOUND' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    I Found Something
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-[#DA291C] font-black uppercase block mb-1">Item Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Blue Hydro Flask / Airpods Pro Case"
                  value={newItem.item_title}
                  onChange={(e) => setNewItem({ ...newItem, item_title: e.target.value })}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#DA291C]"
                />
              </div>

              <div>
                <label className="text-xs text-[#DA291C] font-black uppercase block mb-1">Last Seen / Found Location</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Main Library 2nd Floor, Rec Center Bench"
                  value={newItem.location}
                  onChange={(e) => setNewItem({ ...newItem, location: e.target.value })}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#DA291C]"
                />
              </div>

              <div>
                <label className="text-xs text-[#DA291C] font-black uppercase block mb-1">Description (Optional)</label>
                <textarea
                  placeholder="Add details like color, distinguishing features..."
                  value={newItem.description}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#DA291C] h-20"
                />
              </div>

              <div>
                <label className="text-xs text-[#DA291C] font-black uppercase block mb-1">Image URL (Optional)</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={newItem.image_url}
                  onChange={(e) => setNewItem({ ...newItem, image_url: e.target.value })}
                  className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl p-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-[#DA291C]"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLostFoundModal(false)}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-sm py-2.5 rounded-xl text-slate-700 font-black transition uppercase"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#DA291C] hover:bg-[#b81f15] text-[#FFC72C] font-black text-sm py-2.5 rounded-xl transition shadow-md uppercase tracking-wider"
                >
                  Post Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}