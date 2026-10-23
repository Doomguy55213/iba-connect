import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { Users, Calendar, Plus, UserPlus, RefreshCw, MapPin, Tag, ShieldAlert, LogOut } from 'lucide-react';

const CATEGORIES = ['Sports & Rec', 'Study & Homework', 'Food & Coffee', 'Casual Hangout'];

export default function App() {
  // User Profile State
  const [currentUser, setCurrentUser] = useState(null);
  const [nameInput, setNameInput] = useState('');
  const [contactInput, setContactInput] = useState('');

  // Tab & UI State
  const [activeTab, setActiveTab] = useState('events'); // 'events' | 'matching' | 'lostfound'
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLostFoundModal, setShowLostFoundModal] = useState(false);

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

  // Load User Profile on Mount
  useEffect(() => {
    const savedUser = localStorage.getItem('campus_user');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
    }
    fetchEvents();
    fetchLostFound();
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

  // Create Event
  const handleCreateEvent = async (e) => {
    e.preventDefault();
    if (!newEvent.title.trim() || !newEvent.location.trim()) return;

    const payload = {
      creator_name: currentUser.name,
      contact_handle: currentUser.contact,
      title: newEvent.title,
      location: newEvent.location,
      category: newEvent.category,
      capacity: parseInt(newEvent.capacity, 10),
      joined_count: 1
    };

    const { error } = await supabase.from('events').insert([payload]);
    if (!error) {
      setShowCreateModal(false);
      setNewEvent({ title: '', location: '', category: CATEGORIES[0], capacity: 4 });
      fetchEvents();
    }
  };

  // Report Lost/Found Item
  const handleReportItem = async (e) => {
    e.preventDefault();
    if (!newItem.item_title.trim() || !newItem.location.trim()) return;

    const payload = {
      reporter_name: currentUser.name,
      contact_handle: currentUser.contact,
      item_title: newItem.item_title,
      description: newItem.description,
      location: newItem.location,
      status: newItem.status,
      image_url: newItem.image_url
    };

    const { error } = await supabase.from('lost_found').insert([payload]);
    if (!error) {
      setShowLostFoundModal(false);
      setNewItem({ item_title: '', description: '', location: '', status: 'LOST', image_url: '' });
      fetchLostFound();
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
      <div className="min-h-screen bg-red-700 text-slate-900 flex items-center justify-center p-4">
        <div className="bg-white p-6 rounded-2xl max-w-md w-full border-2 border-red-800 shadow-2xl">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-black tracking-tight text-red-700">IBA Connect</h1>
            <p className="text-red-950 text-xs font-medium mt-1">Enter your details to start hosting or joining campus events.</p>
          </div>
          <form onSubmit={handleSaveUser} className="space-y-4">
            <div>
              <label className="text-xs text-red-800 font-bold uppercase tracking-wider block mb-1">Your Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Alex Smith"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full bg-white border-2 border-red-200 rounded-lg p-3 text-red-950 placeholder-red-300 focus:outline-none focus:border-red-700 transition font-medium"
              />
            </div>
            <div>
              <label className="text-xs text-red-800 font-bold uppercase tracking-wider block mb-1">Contact Handle (Phone / IG / Discord)</label>
              <input
                type="text"
                required
                placeholder="e.g. @alex_smith or 0300-1234567"
                value={contactInput}
                onChange={(e) => setContactInput(e.target.value)}
                className="w-full bg-white border-2 border-red-200 rounded-lg p-3 text-red-950 placeholder-red-300 focus:outline-none focus:border-red-700 transition font-medium"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-red-700 hover:bg-red-800 text-white font-bold p-3 rounded-lg transition shadow-md uppercase tracking-wide text-sm"
            >
              Continue to IBA Connect Feed
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-red-50 text-slate-900 flex flex-col max-w-lg mx-auto border-x-2 border-red-200 shadow-xl">
      {/* Header */}
      <header className="p-4 border-b-2 border-red-800 flex justify-between items-center bg-red-700 text-white sticky top-0 z-10 shadow-md">
        <div>
          <h1 className="font-extrabold text-xl tracking-wide">IBA Connect</h1>
          <p className="text-xs text-red-100 font-medium">Signed in as <span className="font-bold underline text-white">{currentUser.name}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => activeTab === 'lostfound' ? setShowLostFoundModal(true) : setShowCreateModal(true)}
            className="bg-white hover:bg-red-100 p-2 rounded-full text-red-700 transition shadow-md border border-red-200"
            title={activeTab === 'lostfound' ? "Report Item" : "Create Event"}
          >
            <Plus size={20} className="stroke-[3]" />
          </button>
          <button
            onClick={handleSignOut}
            className="bg-red-800 hover:bg-red-900 p-2 rounded-full text-white transition shadow-md border border-red-900"
            title="Sign Out"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="flex border-b-2 border-red-200 bg-white">
        <button
          onClick={() => setActiveTab('events')}
          className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-4 transition ${
            activeTab === 'events' ? 'border-red-700 text-red-700 bg-red-50' : 'border-transparent text-red-950/60 hover:text-red-700'
          }`}
        >
          <Calendar size={16} />
          Events
        </button>
        <button
          onClick={() => setActiveTab('matching')}
          className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-4 transition ${
            activeTab === 'matching' ? 'border-red-700 text-red-700 bg-red-50' : 'border-transparent text-red-950/60 hover:text-red-700'
          }`}
        >
          <UserPlus size={16} />
          1-on-1 Match
        </button>
        <button
          onClick={() => setActiveTab('lostfound')}
          className={`flex-1 py-3 text-xs font-bold flex items-center justify-center gap-1.5 border-b-4 transition ${
            activeTab === 'lostfound' ? 'border-red-700 text-red-700 bg-red-50' : 'border-transparent text-red-950/60 hover:text-red-700'
          }`}
        >
          <ShieldAlert size={16} />
          Lost & Found
        </button>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-4 overflow-y-auto">
        {activeTab === 'events' && (
          /* TAB 1: GROUP EVENTS FEED */
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-black text-red-900 uppercase tracking-widest">Active Campus Events</h2>
              <button onClick={fetchEvents} className="text-xs text-red-700 flex items-center gap-1 hover:underline font-bold">
                <RefreshCw size={12} /> Refresh
              </button>
            </div>

            {events.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-red-200 p-6">
                <p className="text-red-900 font-bold text-base">No active events right now.</p>
                <p className="text-red-950/70 text-xs mt-1">Be the first to host one by tapping the plus button above!</p>
              </div>
            ) : (
              events.map((event) => {
                const isFull = event.joined_count >= event.capacity;
                return (
                  <div key={event.id} className="bg-white border-2 border-red-100 rounded-2xl p-4 space-y-3 shadow-sm hover:border-red-300 transition">
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="font-extrabold text-slate-900 text-base leading-tight">{event.title}</h3>
                      <span className="text-xs px-2.5 py-1 rounded-full bg-red-700 text-white font-bold flex items-center gap-1 shrink-0">
                        <Tag size={10} /> {event.category}
                      </span>
                    </div>

                    <div className="text-xs text-red-950 font-medium space-y-1">
                      <p className="flex items-center gap-1.5"><MapPin size={14} className="text-red-700 shrink-0" /> <span className="font-semibold">{event.location}</span></p>
                      <p className="flex items-center gap-1.5"><Users size={14} className="text-red-700 shrink-0" /> Host: {event.creator_name} ({event.contact_handle})</p>
                    </div>

                    <div className="flex justify-between items-center pt-2.5 border-t border-red-100">
                      <span className="text-xs font-semibold text-red-950">
                        <strong className="text-red-700 font-extrabold text-sm">{event.joined_count}</strong> / {event.capacity} spots filled
                      </span>
                      <button
                        onClick={() => handleJoinEvent(event)}
                        disabled={isFull}
                        className={`text-xs px-4 py-2 rounded-xl font-extrabold transition uppercase tracking-wide ${
                          isFull
                            ? 'bg-red-100 text-red-300 border border-red-200 cursor-not-allowed'
                            : 'bg-red-700 hover:bg-red-800 text-white shadow-sm'
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

        {activeTab === 'matching' && (
          /* TAB 2: 1-ON-1 MATCHING */
          <div className="space-y-6 text-center py-6">
            <div>
              <h2 className="text-2xl font-black text-red-900 mb-1">Instant 1-on-1 Hangout</h2>
              <p className="text-xs font-semibold text-red-950/70">Match with someone free right now on campus.</p>
            </div>

            {matchingStatus === 'idle' && (
              <div className="bg-white border-2 border-red-200 p-6 rounded-2xl space-y-4 max-w-xs mx-auto shadow-md">
                <label className="text-xs text-red-800 font-bold uppercase block text-left tracking-wider">Select Category</label>
                <select
                  value={matchCategory}
                  onChange={(e) => setMatchCategory(e.target.value)}
                  className="w-full bg-white border-2 border-red-200 rounded-lg p-3 text-sm font-bold text-red-950 focus:outline-none focus:border-red-700"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>

                <button
                  onClick={startMatchingSearch}
                  className="w-full bg-red-700 hover:bg-red-800 text-white font-extrabold text-sm py-3.5 rounded-xl transition shadow-md uppercase tracking-wider"
                >
                  Find Partner Now
                </button>
              </div>
            )}

            {matchingStatus === 'searching' && (
              <div className="bg-white border-2 border-red-200 p-8 rounded-2xl space-y-4 max-w-xs mx-auto shadow-md">
                <div className="animate-spin text-red-700 inline-block">
                  <RefreshCw size={36} />
                </div>
                <p className="text-sm font-bold text-red-950">Searching for someone free for {matchCategory}...</p>
                <button
                  onClick={cancelSearch}
                  className="text-xs text-red-700 hover:underline pt-2 block mx-auto font-black uppercase tracking-wider"
                >
                  Cancel Search
                </button>
              </div>
            )}

            {matchingStatus === 'matched' && matchedPartner && (
              <div className="bg-white border-2 border-red-700 p-6 rounded-2xl space-y-3 max-w-xs mx-auto shadow-lg">
                <h3 className="text-xl font-black text-red-700">Match Found! 🎉</h3>
                <div className="text-sm text-red-950">
                  <p className="font-extrabold text-base text-slate-900">{matchedPartner.name}</p>
                  <p className="text-xs font-semibold text-red-800 mt-1">Contact: <span className="text-red-700 font-bold underline">{matchedPartner.contact}</span></p>
                </div>
                <p className="text-xs font-medium text-red-950/70 pt-2 border-t border-red-100">
                  Reach out to agree on a campus meeting spot!
                </p>
                <button
                  onClick={() => setMatchingStatus('idle')}
                  className="w-full bg-red-700 hover:bg-red-800 text-xs py-2.5 rounded-lg text-white font-bold transition uppercase"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'lostfound' && (
          /* TAB 3: LOST AND FOUND */
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-black text-red-900 uppercase tracking-widest">Campus Lost & Found Board</h2>
              <button onClick={fetchLostFound} className="text-xs text-red-700 flex items-center gap-1 hover:underline font-bold">
                <RefreshCw size={12} /> Refresh
              </button>
            </div>

            {lostFoundItems.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border-2 border-dashed border-red-200 p-6">
                <p className="text-red-900 font-bold text-base">No reported items.</p>
                <p className="text-red-950/70 text-xs mt-1">Found or lost something? Tap the plus button to post!</p>
              </div>
            ) : (
              lostFoundItems.map((item) => (
                <div key={item.id} className="bg-white border-2 border-red-100 rounded-2xl p-4 space-y-3 shadow-sm hover:border-red-300 transition">
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="font-extrabold text-slate-900 text-base leading-tight">{item.item_title}</h3>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-black uppercase tracking-wider text-white ${
                      item.status === 'LOST' ? 'bg-red-700' : 'bg-emerald-600'
                    }`}>
                      {item.status}
                    </span>
                  </div>

                  {item.description && (
                    <p className="text-xs text-slate-700 font-medium">{item.description}</p>
                  )}

                  {item.image_url && (
                    <img src={item.image_url} alt={item.item_title} className="w-full h-36 object-cover rounded-xl border border-red-100" />
                  )}

                  <div className="text-xs text-red-950 font-medium space-y-1 pt-1 border-t border-red-100">
                    <p className="flex items-center gap-1.5"><MapPin size={14} className="text-red-700 shrink-0" /> Location: <span className="font-semibold">{item.location}</span></p>
                    <p className="flex items-center gap-1.5"><Users size={14} className="text-red-700 shrink-0" /> Contact: <span className="font-bold underline text-red-700">{item.reporter_name} ({item.contact_handle})</span></p>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* CREATE EVENT MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-red-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border-2 border-red-700 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-xl font-black text-red-700">Host a Campus Event</h3>
            <form onSubmit={handleCreateEvent} className="space-y-3">
              <div>
                <label className="text-xs text-red-800 font-bold uppercase block mb-1">Activity Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Badminton Doubles / C++ Study Session"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  className="w-full bg-white border-2 border-red-200 rounded-lg p-2.5 text-sm font-medium text-red-950 focus:outline-none focus:border-red-700"
                />
              </div>

              <div>
                <label className="text-xs text-red-800 font-bold uppercase block mb-1">Campus Location</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rec Center Court 2, Student Centre Lawn"
                  value={newEvent.location}
                  onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                  className="w-full bg-white border-2 border-red-200 rounded-lg p-2.5 text-sm font-medium text-red-950 focus:outline-none focus:border-red-700"
                />
              </div>

              <div>
                <label className="text-xs text-red-800 font-bold uppercase block mb-1">Category</label>
                <select
                  value={newEvent.category}
                  onChange={(e) => setNewEvent({ ...newEvent, category: e.target.value })}
                  className="w-full bg-white border-2 border-red-200 rounded-lg p-2.5 text-sm font-bold text-red-950 focus:outline-none focus:border-red-700"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-red-800 font-bold uppercase block mb-1">Max Capacity</label>
                <input
                  type="number"
                  min="2"
                  max="20"
                  value={newEvent.capacity}
                  onChange={(e) => setNewEvent({ ...newEvent, capacity: e.target.value })}
                  className="w-full bg-white border-2 border-red-200 rounded-lg p-2.5 text-sm font-medium text-red-950 focus:outline-none focus:border-red-700"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 bg-red-100 hover:bg-red-200 text-sm py-2.5 rounded-lg text-red-900 font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-red-700 hover:bg-red-800 text-white font-extrabold text-sm py-2.5 rounded-lg transition shadow-md uppercase tracking-wider"
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
        <div className="fixed inset-0 bg-red-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white border-2 border-red-700 rounded-2xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-xl font-black text-red-700">Report Lost or Found Item</h3>
            <form onSubmit={handleReportItem} className="space-y-3">
              <div>
                <label className="text-xs text-red-800 font-bold uppercase block mb-1">Status</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNewItem({ ...newItem, status: 'LOST' })}
                    className={`flex-1 py-2 rounded-lg font-bold text-xs uppercase ${
                      newItem.status === 'LOST' ? 'bg-red-700 text-white' : 'bg-red-100 text-red-900'
                    }`}
                  >
                    I Lost Something
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewItem({ ...newItem, status: 'FOUND' })}
                    className={`flex-1 py-2 rounded-lg font-bold text-xs uppercase ${
                      newItem.status === 'FOUND' ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-900'
                    }`}
                  >
                    I Found Something
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs text-red-800 font-bold uppercase block mb-1">Item Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Blue Hydro Flask / Airpods Pro Case"
                  value={newItem.item_title}
                  onChange={(e) => setNewItem({ ...newItem, item_title: e.target.value })}
                  className="w-full bg-white border-2 border-red-200 rounded-lg p-2.5 text-sm font-medium text-red-950 focus:outline-none focus:border-red-700"
                />
              </div>

              <div>
                <label className="text-xs text-red-800 font-bold uppercase block mb-1">Last Seen / Found Location</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Main Library 2nd Floor, Rec Center Bench"
                  value={newItem.location}
                  onChange={(e) => setNewItem({ ...newItem, location: e.target.value })}
                  className="w-full bg-white border-2 border-red-200 rounded-lg p-2.5 text-sm font-medium text-red-950 focus:outline-none focus:border-red-700"
                />
              </div>

              <div>
                <label className="text-xs text-red-800 font-bold uppercase block mb-1">Description (Optional)</label>
                <textarea
                  placeholder="Add details like color, distinguishing features..."
                  value={newItem.description}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  className="w-full bg-white border-2 border-red-200 rounded-lg p-2.5 text-sm font-medium text-red-950 focus:outline-none focus:border-red-700 h-20"
                />
              </div>

              <div>
                <label className="text-xs text-red-800 font-bold uppercase block mb-1">Image URL (Optional)</label>
                <input
                  type="url"
                  placeholder="https://..."
                  value={newItem.image_url}
                  onChange={(e) => setNewItem({ ...newItem, image_url: e.target.value })}
                  className="w-full bg-white border-2 border-red-200 rounded-lg p-2.5 text-sm font-medium text-red-950 focus:outline-none focus:border-red-700"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowLostFoundModal(false)}
                  className="flex-1 bg-red-100 hover:bg-red-200 text-sm py-2.5 rounded-lg text-red-900 font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-red-700 hover:bg-red-800 text-white font-extrabold text-sm py-2.5 rounded-lg transition shadow-md uppercase tracking-wider"
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