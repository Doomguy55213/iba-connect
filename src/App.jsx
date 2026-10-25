import React, { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import { 
  Users, Calendar, Plus, UserPlus, RefreshCw, MapPin, Tag, 
  ShieldAlert, LogOut, Car, MessageCircle, Navigation, Search, 
  BookOpen, Upload, ChevronRight, X, Send, Bell
} from 'lucide-react';

const CATEGORIES = ['Sports & Rec', 'Study & Homework', 'Food & Coffee', 'Casual Hangout'];

function parseCourseOutline(outlineText, maxTopicOrWeek) {
  if (!outlineText.trim()) return [];
  const lines = outlineText.split(/\n+/).map(l => l.trim()).filter(l => l.length > 0);
  let extractedTopics = [];
  let include = true;

  lines.forEach((line, index) => {
    if (maxTopicOrWeek && line.toLowerCase().includes(maxTopicOrWeek.toLowerCase())) {
      extractedTopics.push({ id: `topic_${index}`, title: line, weight: 20 });
      include = false;
    } else if (include) {
      extractedTopics.push({ id: `topic_${index}`, title: line, weight: 15 });
    }
  });
  return extractedTopics;
}

function buildInteractivePlan(topics, completedIds, targetDays = 5) {
  const unstudied = topics.filter(t => !completedIds.includes(t.id));
  if (unstudied.length === 0) return [];

  const itemsPerDay = Math.ceil(unstudied.length / Math.max(1, targetDays));
  let plan = [];

  unstudied.forEach((topic, idx) => {
    const day = Math.min(Math.floor(idx / itemsPerDay) + 1, targetDays);
    plan.push({
      id: topic.id,
      day,
      title: topic.title,
      estimatedHours: Math.max(1, Math.round(topic.weight / 10)),
      strategy: `Review notes for "${topic.title}", attempt 2 past-paper problems, and draft flashcards.`,
      isDone: false
    });
  });

  return plan;
}

export default function App() {
  // User Profile State
  const [currentUser, setCurrentUser] = useState(null);
  const [nameInput, setNameInput] = useState('');
  const [contactInput, setContactInput] = useState('');

  // Tab & UI State
  const [activeTab, setActiveTab] = useState('events'); 
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showLostFoundModal, setShowLostFoundModal] = useState(false);
  const [showCarpoolModal, setShowCarpoolModal] = useState(false);

  // Chat & Notification Side Drawer State
  const [isChatDrawerOpen, setIsChatDrawerOpen] = useState(false);
  const [activeGroupChat, setActiveGroupChat] = useState(null); // { id: 'event_123', title: 'Badminton' }
  const [joinedChatGroups, setJoinedChatGroups] = useState([]); // List of chats user belongs to
  const [notifications, setNotifications] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [newMessageText, setNewMessageText] = useState('');
  const [hasUnreadNotifs, setHasUnreadNotifs] = useState(false);

  // Feed States
  const [events, setEvents] = useState([]);
  const [newEvent, setNewEvent] = useState({ title: '', location: '', category: CATEGORIES[0], capacity: 4 });
  const [matchCategory, setMatchCategory] = useState(CATEGORIES[0]);
  const [matchingStatus, setMatchingStatus] = useState('idle');
  const [matchedPartner, setMatchedPartner] = useState(null);
  const [queueRecordId, setQueueRecordId] = useState(null);
  const [lostFoundItems, setLostFoundItems] = useState([]);
  const [newItem, setNewItem] = useState({ item_title: '', description: '', location: '', status: 'LOST', image_url: '' });
  const [carpools, setCarpools] = useState([]);
  const [newCarpool, setNewCarpool] = useState({ type: 'OFFER', origin: 'IBA Main Campus', destination: '', departure_time: '', available_seats: 3, cost_notes: '' });
  const [selectedCampusNav, setSelectedCampusNav] = useState('Main Campus');
  const [locations, setLocations] = useState([]);
  const [navSearchQuery, setNavSearchQuery] = useState('');

  // Roadmap State
  const [courseTitleInput, setCourseTitleInput] = useState('');
  const [outlineInput, setOutlineInput] = useState('');
  const [cutoffInput, setCutoffInput] = useState('');
  const [parsedTopics, setParsedTopics] = useState([]);
  const [completedTopicIds, setCompletedTopicIds] = useState([]);
  const [targetDays, setTargetDays] = useState(5);
  const [interactivePlan, setInteractivePlan] = useState([]);
  const [isOutlineAnalyzed, setIsOutlineAnalyzed] = useState(false);

  useEffect(() => {
    const savedUser = localStorage.getItem('campus_user');
    if (savedUser) {
      setCurrentUser(JSON.parse(savedUser));
    }
    fetchEvents();
    fetchLostFound();
    fetchCarpools();
    fetchLocations();
  }, []);

  // Poll chat messages if a chat group is active
  useEffect(() => {
    let interval = null;
    if (activeGroupChat) {
      fetchGroupMessages(activeGroupChat.id);
      interval = setInterval(() => fetchGroupMessages(activeGroupChat.id), 2500);
    }
    return () => clearInterval(interval);
  }, [activeGroupChat]);

  // Poll matching status
  useEffect(() => {
    let interval = null;
    if (matchingStatus === 'searching' && queueRecordId) {
      interval = setInterval(async () => {
        await checkQueueForMatch();
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [matchingStatus, queueRecordId]);

  const fetchGroupMessages = async (groupId) => {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });
    if (data) setChatMessages(data);
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessageText.trim() || !activeGroupChat || !currentUser) return;

    const payload = {
      group_id: activeGroupChat.id,
      group_title: activeGroupChat.title,
      sender_name: currentUser.name,
      message_text: newMessageText.trim()
    };

    const { error } = await supabase.from('chat_messages').insert([payload]);
    if (!error) {
      setNewMessageText('');
      fetchGroupMessages(activeGroupChat.id);
    }
  };

  const addNotificationAndGroup = (group, notifMsg) => {
    setJoinedChatGroups((prev) => {
      if (!prev.some(g => g.id === group.id)) return [...prev, group];
      return prev;
    });

    setNotifications((prev) => [
      { id: Date.now(), text: notifMsg, time: 'Just now' },
      ...prev
    ]);
    setHasUnreadNotifs(true);
  };

  // Immediate Auto-Analysis File Upload Handler
  const handleImmediateFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const fileContent = evt.target.result;
      setOutlineInput(fileContent);

      const derivedCourseName = courseTitleInput.trim() 
        ? courseTitleInput.trim() 
        : file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

      if (!courseTitleInput.trim()) {
        setCourseTitleInput(derivedCourseName);
      }

      const topics = parseCourseOutline(fileContent, cutoffInput);
      setParsedTopics(topics);
      setCompletedTopicIds([]);
      setInteractivePlan(buildInteractivePlan(topics, [], targetDays));
      setIsOutlineAnalyzed(true);
    };

    reader.readAsText(file);
  };

  const handleSaveUser = (e) => {
    e.preventDefault();
    if (!nameInput.trim() || !contactInput.trim()) return;
    const user = { name: nameInput.trim(), contact: contactInput.trim() };
    localStorage.setItem('campus_user', JSON.stringify(user));
    setCurrentUser(user);
  };

  const handleSignOut = () => {
    localStorage.removeItem('campus_user');
    setCurrentUser(null);
    setNameInput('');
    setContactInput('');
  };

  const fetchEvents = async () => {
    const { data, error } = await supabase.from('events').select('*').order('created_at', { ascending: false });
    if (!error && data) setEvents(data);
  };

  const fetchLostFound = async () => {
    const { data, error } = await supabase.from('lost_found').select('*').order('created_at', { ascending: false });
    if (!error && data) setLostFoundItems(data);
  };

  const fetchCarpools = async () => {
    const { data, error } = await supabase.from('carpools').select('*').order('created_at', { ascending: false });
    if (!error && data) setCarpools(data);
  };

  const fetchLocations = async () => {
    const { data, error } = await supabase.from('campus_locations').select('*').order('map_number', { ascending: true });
    if (!error && data) setLocations(data);
  };

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

    const { data, error } = await supabase.from('events').insert([payload]).select();

    if (error) {
      alert(`Failed to publish event: ${error.message}`);
    } else if (data && data.length > 0) {
      const created = data[0];
      const groupObj = { id: `event_${created.id}`, title: created.title, type: 'Event' };
      addNotificationAndGroup(groupObj, `You hosted "${created.title}". Group Chat created!`);
      setShowCreateModal(false);
      setNewEvent({ title: '', location: '', category: CATEGORIES[0], capacity: 4 });
      fetchEvents();
    }
  };

  const handleJoinEvent = async (event) => {
    if (event.joined_count >= event.capacity) return;
    const { error } = await supabase.from('events').update({ joined_count: event.joined_count + 1 }).eq('id', event.id);
    if (!error) {
      const groupObj = { id: `event_${event.id}`, title: event.title, type: 'Event' };
      addNotificationAndGroup(groupObj, `You joined "${event.title}". Added to group chat!`);
      fetchEvents();
    }
  };

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

    const { data, error } = await supabase.from('carpools').insert([payload]).select();

    if (error) {
      alert(`Failed to post carpool: ${error.message}`);
    } else if (data && data.length > 0) {
      const created = data[0];
      const groupObj = { id: `carpool_${created.id}`, title: `Ride to ${created.destination}`, type: 'Carpool' };
      addNotificationAndGroup(groupObj, `You posted a ride to "${created.destination}". Group Chat created!`);
      setShowCarpoolModal(false);
      setNewCarpool({ type: 'OFFER', origin: 'IBA Main Campus', destination: '', departure_time: '', available_seats: 3, cost_notes: '' });
      fetchCarpools();
    }
  };

  const handleClaimCarpoolSeat = async (ride) => {
    if (ride.joined_count >= ride.available_seats) return;
    const { error } = await supabase.from('carpools').update({ joined_count: ride.joined_count + 1 }).eq('id', ride.id);
    if (!error) {
      const groupObj = { id: `carpool_${ride.id}`, title: `Ride to ${ride.destination}`, type: 'Carpool' };
      addNotificationAndGroup(groupObj, `Seat accepted for ride to "${ride.destination}". Added to group chat!`);
      fetchCarpools();
    }
  };

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

    if (!error) {
      setShowLostFoundModal(false);
      setNewItem({ item_title: '', description: '', location: '', status: 'LOST', image_url: '' });
      fetchLostFound();
    }
  };

  const startMatchingSearch = async () => {
    setMatchingStatus('searching');
    setMatchedPartner(null);

    const { data, error } = await supabase
      .from('hangout_queue')
      .insert([{ user_name: currentUser.name, contact_handle: currentUser.contact, category: matchCategory, status: 'searching' }])
      .select();

    if (!error && data && data.length > 0) {
      setQueueRecordId(data[0].id);
    }
  };

  const checkQueueForMatch = async () => {
    if (!queueRecordId || !currentUser) return;

    const { data: myRecord } = await supabase.from('hangout_queue').select('*').eq('id', queueRecordId).single();

    if (myRecord && myRecord.status === 'matched') {
      setMatchedPartner({ name: myRecord.matched_user_name, contact: myRecord.matched_contact });
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
      await supabase.from('hangout_queue').update({ status: 'matched', matched_user_name: currentUser.name, matched_contact: currentUser.contact }).eq('id', partner.id);
      await supabase.from('hangout_queue').update({ status: 'matched' }).eq('id', queueRecordId);

      setMatchedPartner({ name: partner.user_name, contact: partner.contact_handle });
      setMatchingStatus('matched');
    }
  };

  const cancelSearch = async () => {
    if (queueRecordId) {
      await supabase.from('hangout_queue').delete().eq('id', queueRecordId);
    }
    setMatchingStatus('idle');
    setQueueRecordId(null);
  };

  const filteredNavLocations = locations.filter((loc) => {
    const matchesCampus = loc.campus === selectedCampusNav;
    const matchesQuery = loc.name.toLowerCase().includes(navSearchQuery.toLowerCase()) ||
                         loc.description.toLowerCase().includes(navSearchQuery.toLowerCase()) ||
                         loc.category.toLowerCase().includes(navSearchQuery.toLowerCase());
    return matchesCampus && matchesQuery;
  });

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#800020] text-slate-900 flex items-center justify-center p-6">
        <div className="bg-white p-8 rounded-3xl max-w-sm w-full shadow-2xl space-y-6">
          <div className="text-center space-y-1">
            <h1 className="text-2xl font-bold text-[#800020] tracking-tight">IBA Connect</h1>
            <p className="text-slate-500 text-xs">Enter details to explore campus events & study tools.</p>
          </div>
          <form onSubmit={handleSaveUser} className="space-y-4">
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Your Name</label>
              <input
                type="text"
                required
                placeholder="e.g. Alex Smith"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-800 focus:outline-none focus:border-[#800020]"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">Contact Handle / WhatsApp</label>
              <input
                type="text"
                required
                placeholder="e.g. 03001234567 or @alex"
                value={contactInput}
                onChange={(e) => setContactInput(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-800 focus:outline-none focus:border-[#800020]"
              />
            </div>
            <button
              type="submit"
              className="w-full bg-[#800020] hover:bg-[#660019] text-white font-medium p-3.5 rounded-xl transition text-sm shadow-sm"
            >
              Continue
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-slate-800 flex flex-col max-w-md mx-auto shadow-xl relative overflow-x-hidden">
      {/* Minimalist Header */}
      <header className="p-5 bg-[#800020] text-white sticky top-0 z-10 flex justify-between items-center shadow-sm">
        <div>
          <h1 className="font-semibold text-xl tracking-tight text-white">Discover</h1>
          <p className="text-[11px] text-white/80">Welcome, {currentUser.name}</p>
        </div>
        <div className="flex items-center gap-2">
          {activeTab !== 'navigation' && activeTab !== 'roadmap' && (
            <button
              onClick={() => {
                if (activeTab === 'lostfound') setShowLostFoundModal(true);
                else if (activeTab === 'carpool') setShowCarpoolModal(true);
                else setShowCreateModal(true);
              }}
              className="bg-white/10 hover:bg-white/20 p-2 rounded-full text-white transition"
              title="Create Post"
            >
              <Plus size={18} />
            </button>
          )}
          <button
            onClick={handleSignOut}
            className="bg-white/10 hover:bg-white/20 p-2 rounded-full text-white transition"
            title="Sign Out"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Navigation Sub-Header Bar */}
      <div className="flex bg-white border-b border-slate-100 overflow-x-auto scrollbar-none px-2">
        <button
          onClick={() => setActiveTab('events')}
          className={`px-4 py-3 text-xs font-medium flex items-center gap-1.5 border-b-2 transition shrink-0 ${
            activeTab === 'events' ? 'border-[#800020] text-[#800020]' : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Calendar size={14} /> Events
        </button>
        <button
          onClick={() => setActiveTab('carpool')}
          className={`px-4 py-3 text-xs font-medium flex items-center gap-1.5 border-b-2 transition shrink-0 ${
            activeTab === 'carpool' ? 'border-[#800020] text-[#800020]' : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Car size={14} /> Carpool
        </button>
        <button
          onClick={() => setActiveTab('roadmap')}
          className={`px-4 py-3 text-xs font-medium flex items-center gap-1.5 border-b-2 transition shrink-0 ${
            activeTab === 'roadmap' ? 'border-[#800020] text-[#800020]' : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <BookOpen size={14} /> Roadmap
        </button>
        <button
          onClick={() => setActiveTab('navigation')}
          className={`px-4 py-3 text-xs font-medium flex items-center gap-1.5 border-b-2 transition shrink-0 ${
            activeTab === 'navigation' ? 'border-[#800020] text-[#800020]' : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <Navigation size={14} /> Guide/Map
        </button>
        <button
          onClick={() => setActiveTab('matching')}
          className={`px-4 py-3 text-xs font-medium flex items-center gap-1.5 border-b-2 transition shrink-0 ${
            activeTab === 'matching' ? 'border-[#800020] text-[#800020]' : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <UserPlus size={14} /> 1-on-1
        </button>
        <button
          onClick={() => setActiveTab('lostfound')}
          className={`px-4 py-3 text-xs font-medium flex items-center gap-1.5 border-b-2 transition shrink-0 ${
            activeTab === 'lostfound' ? 'border-[#800020] text-[#800020]' : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          <ShieldAlert size={14} /> Lost/Found
        </button>
      </div>

      {/* Main Content Area */}
      <main className="flex-1 p-4 overflow-y-auto space-y-4 mb-16">
        {activeTab === 'events' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center pb-1">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Popular Events</h2>
              <button onClick={fetchEvents} className="text-xs text-[#800020] flex items-center gap-1 hover:underline font-medium">
                <RefreshCw size={12} /> Refresh
              </button>
            </div>

            {events.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <p className="text-slate-700 font-medium text-sm">No active events found.</p>
                <p className="text-slate-400 text-xs mt-1">Tap the plus button above to host a new event.</p>
              </div>
            ) : (
              events.map((event) => {
                const isFull = event.joined_count >= event.capacity;
                return (
                  <div key={event.id} className="bg-white border border-slate-100 rounded-2xl p-4 space-y-3 shadow-sm hover:shadow-md transition">
                    <div className="flex justify-between items-start gap-2">
                      <h3 className="font-semibold text-slate-900 text-base leading-snug">{event.title}</h3>
                      <span className="text-[10px] px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium shrink-0">
                        {event.category}
                      </span>
                    </div>

                    <div className="text-xs text-slate-500 space-y-1">
                      <p className="flex items-center gap-1.5"><MapPin size={13} className="text-slate-400 shrink-0" /> {event.location}</p>
                      <p className="flex items-center gap-1.5"><Users size={13} className="text-slate-400 shrink-0" /> Host: {event.creator_name} ({event.contact_handle})</p>
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                      <span className="text-xs text-slate-400">
                        <strong className="text-slate-800 font-semibold">{event.joined_count}</strong> / {event.capacity} spots
                      </span>
                      <button
                        onClick={() => handleJoinEvent(event)}
                        disabled={isFull}
                        className={`text-xs px-3.5 py-1.5 rounded-lg font-medium transition ${
                          isFull
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : 'bg-[#800020] text-white hover:bg-[#660019]'
                        }`}
                      >
                        {isFull ? 'Full' : 'Join'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'carpool' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center pb-1">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Campus Rideshare</h2>
              <button onClick={fetchCarpools} className="text-xs text-[#800020] flex items-center gap-1 hover:underline font-medium">
                <RefreshCw size={12} /> Refresh
              </button>
            </div>

            {carpools.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
                <p className="text-slate-700 font-medium text-sm">No rides posted yet.</p>
                <p className="text-slate-400 text-xs mt-1">Offer or request a ride using the plus button.</p>
              </div>
            ) : (
              carpools.map((ride) => {
                const isFull = ride.type === 'OFFER' && ride.joined_count >= ride.available_seats;

                return (
                  <div key={ride.id} className="bg-white border border-slate-100 rounded-2xl p-4 space-y-3 shadow-sm hover:shadow-md transition">
                    <div className="flex justify-between items-start gap-2">
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-medium ${
                        ride.type === 'OFFER' ? 'bg-[#800020]/10 text-[#800020]' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {ride.type === 'OFFER' ? 'Car Offered' : 'Ride Needed'}
                      </span>
                      <h3 className="font-semibold text-slate-900 text-sm">{ride.origin} $\rightarrow$ {ride.destination}</h3>
                    </div>

                    <div className="text-xs text-slate-500 space-y-1">
                      <p className="flex items-center gap-1.5"><Calendar size={13} className="text-slate-400" /> {ride.departure_time}</p>
                      <p className="flex items-center gap-1.5"><Users size={13} className="text-slate-400" /> {ride.creator_name}</p>
                      {ride.cost_notes && <p className="text-slate-400 italic text-[11px]">"{ride.cost_notes}"</p>}
                    </div>

                    <div className="flex justify-between items-center pt-2 border-t border-slate-50">
                      {ride.type === 'OFFER' ? (
                        <span className="text-xs text-slate-400">
                          <strong className="text-slate-800">{ride.available_seats - ride.joined_count}</strong> / {ride.available_seats} seats left
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Seeking Ride</span>
                      )}

                      {ride.type === 'OFFER' && (
                        <button
                          onClick={() => handleClaimCarpoolSeat(ride)}
                          disabled={isFull}
                          className={`text-xs px-3.5 py-1.5 rounded-lg font-medium transition ${
                            isFull ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-[#800020] text-white'
                          }`}
                        >
                          {isFull ? 'Full' : 'Accept Ride'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}

        {activeTab === 'roadmap' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Outline AI Roadmap</h2>
              {isOutlineAnalyzed && (
                <button
                  onClick={() => {
                    setIsOutlineAnalyzed(false);
                    setInteractivePlan([]);
                  }}
                  className="text-xs text-[#800020] font-medium hover:underline"
                >
                  New Outline
                </button>
              )}
            </div>

            {!isOutlineAnalyzed ? (
              <div className="bg-white border border-slate-100 rounded-2xl p-5 space-y-4 shadow-sm">
                <div>
                  <label className="text-xs text-slate-500 font-medium uppercase block mb-1">Subject Name (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Data Structures"
                    value={courseTitleInput}
                    onChange={(e) => setCourseTitleInput(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#800020]"
                  />
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-slate-500 font-medium uppercase block mb-1">Option A: Upload Syllabus (.txt / .md)</label>
                    <label className="flex flex-col items-center justify-center w-full h-24 border border-slate-200 border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100/50 transition">
                      <div className="flex flex-col items-center justify-center">
                        <Upload size={20} className="text-slate-400 mb-1" />
                        <p className="text-xs text-slate-600 font-medium">Tap to upload syllabus</p>
                      </div>
                      <input type="file" accept=".txt,.md,.csv" onChange={handleImmediateFileUpload} className="hidden" />
                    </label>
                  </div>

                  <div className="text-center text-[10px] text-slate-300 font-bold uppercase">— OR —</div>

                  <div>
                    <label className="text-xs text-slate-500 font-medium uppercase block mb-1">Option B: Paste Outline</label>
                    <textarea
                      placeholder="Paste syllabus lines..."
                      value={outlineInput}
                      onChange={(e) => setOutlineInput(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#800020] h-24"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-slate-500 font-medium uppercase block mb-1">Target Cutoff Week/Topic (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Week 3, Midterm 1"
                    value={cutoffInput}
                    onChange={(e) => setCutoffInput(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-[#800020]"
                  />
                </div>

                <button
                  onClick={() => {
                    if (!outlineInput.trim()) {
                      alert('Please upload a syllabus file or paste your course outline.');
                      return;
                    }
                    const derivedTitle = courseTitleInput.trim() || 'Custom Syllabus';
                    setCourseTitleInput(derivedTitle);
                    const topics = parseCourseOutline(outlineInput, cutoffInput);
                    setParsedTopics(topics);
                    setInteractivePlan(buildInteractivePlan(topics, [], targetDays));
                    setIsOutlineAnalyzed(true);
                  }}
                  className="w-full bg-[#800020] hover:bg-[#660019] text-white font-medium text-xs py-3 rounded-xl transition shadow-sm"
                >
                  Analyze Text & Build Roadmap
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-white border border-slate-100 rounded-2xl p-4 space-y-3 shadow-sm">
                  <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                    <div>
                      <h3 className="font-semibold text-slate-800 text-sm">{courseTitleInput}</h3>
                      <p className="text-[11px] text-slate-400">Cutoff: {cutoffInput || 'Full Syllabus'}</p>
                    </div>
                    <span className="text-base font-bold text-[#800020]">
                      {Math.round((completedTopicIds.length / Math.max(1, parsedTopics.length)) * 100)}%
                    </span>
                  </div>

                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-[#800020] h-full transition-all duration-300"
                      style={{ width: `${(completedTopicIds.length / Math.max(1, parsedTopics.length)) * 100}%` }}
                    />
                  </div>

                  <div className="space-y-1.5 pt-1">
                    <label className="text-[11px] text-slate-400 font-medium uppercase block">Mark Mastered Topics</label>
                    <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                      {parsedTopics.map((topic) => (
                        <label key={topic.id} className="flex items-center gap-2 text-xs text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-100 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={completedTopicIds.includes(topic.id)}
                            onChange={(e) => {
                              let updated = [];
                              if (e.target.checked) updated = [...completedTopicIds, topic.id];
                              else updated = completedTopicIds.filter(id => id !== topic.id);
                              setCompletedTopicIds(updated);
                              const plan = buildInteractivePlan(parsedTopics, updated, targetDays);
                              setInteractivePlan(plan);
                            }}
                            className="accent-[#800020] w-3.5 h-3.5 rounded"
                          />
                          <span className={completedTopicIds.includes(topic.id) ? 'line-through text-slate-400' : ''}>
                            {topic.title}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Study Schedule</h3>
                  {interactivePlan.map((item) => (
                    <div key={item.id} className="bg-white border border-slate-100 rounded-xl p-3 space-y-2 shadow-sm">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] bg-slate-100 text-slate-600 font-medium px-2 py-0.5 rounded-full">
                          Day {item.day}
                        </span>
                        <span className="text-[10px] text-slate-400">~{item.estimatedHours} hrs</span>
                      </div>
                      <h4 className="font-semibold text-slate-800 text-xs">{item.title}</h4>
                      <p className="text-[11px] text-slate-500">{item.strategy}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'navigation' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Campus Guide</h2>
              <div className="flex bg-slate-100 p-0.5 rounded-lg">
                <button
                  onClick={() => setSelectedCampusNav('Main Campus')}
                  className={`text-[10px] font-medium px-2.5 py-1 rounded-md transition ${
                    selectedCampusNav === 'Main Campus' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'
                  }`}
                >
                  Main
                </button>
                <button
                  onClick={() => setSelectedCampusNav('City Campus')}
                  className={`text-[10px] font-medium px-2.5 py-1 rounded-md transition ${
                    selectedCampusNav === 'City Campus' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'
                  }`}
                >
                  City
                </button>
              </div>
            </div>

            <div className="relative">
              <Search size={14} className="absolute left-3 top-3 text-slate-400" />
              <input
                type="text"
                placeholder={`Search ${selectedCampusNav}...`}
                value={navSearchQuery}
                onChange={(e) => setNavSearchQuery(e.target.value)}
                className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#800020]"
              />
            </div>

            <div className="space-y-2">
              {filteredNavLocations.map((loc) => {
                const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                  `IBA ${loc.campus} ${loc.name} Karachi`
                )}&travelmode=walking`;

                return (
                  <a
                    key={loc.id}
                    href={directionsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="flex justify-between items-center bg-white border border-slate-100 p-3 rounded-xl shadow-sm hover:border-slate-200 transition"
                  >
                    <div>
                      <h3 className="font-semibold text-slate-800 text-xs">{loc.name}</h3>
                      <p className="text-[11px] text-slate-400">{loc.description}</p>
                    </div>
                    <ChevronRight size={16} className="text-slate-300" />
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === 'matching' && (
          <div className="space-y-4 text-center py-8">
            <h2 className="text-xl font-bold text-slate-800">1-on-1 Hangout</h2>
            <p className="text-xs text-slate-400">Match with someone free on campus right now.</p>

            {matchingStatus === 'idle' && (
              <div className="bg-white border border-slate-100 p-6 rounded-2xl space-y-3 max-w-xs mx-auto shadow-sm">
                <select
                  value={matchCategory}
                  onChange={(e) => setMatchCategory(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
                <button
                  onClick={startMatchingSearch}
                  className="w-full bg-[#800020] text-white text-xs py-2.5 rounded-xl font-medium"
                >
                  Find Partner
                </button>
              </div>
            )}

            {matchingStatus === 'searching' && (
              <div className="bg-white border border-slate-100 p-6 rounded-2xl space-y-3 max-w-xs mx-auto shadow-sm">
                <RefreshCw size={24} className="animate-spin text-[#800020] mx-auto" />
                <p className="text-xs text-slate-600">Searching for available partner...</p>
                <button onClick={cancelSearch} className="text-xs text-[#800020] underline">Cancel</button>
              </div>
            )}

            {matchingStatus === 'matched' && matchedPartner && (
              <div className="bg-white border border-slate-100 p-6 rounded-2xl space-y-2 max-w-xs mx-auto shadow-sm">
                <h3 className="text-base font-bold text-[#800020]">Match Found!</h3>
                <p className="text-xs text-slate-700 font-semibold">{matchedPartner.name}</p>
                <p className="text-xs text-slate-400">{matchedPartner.contact}</p>
                <button onClick={() => setMatchingStatus('idle')} className="w-full bg-slate-100 text-xs py-2 rounded-xl text-slate-700 mt-2">Done</button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'lostfound' && (
          <div className="space-y-3">
            <div className="flex justify-between items-center pb-1">
              <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Lost & Found Board</h2>
              <button onClick={fetchLostFound} className="text-xs text-[#800020] flex items-center gap-1 hover:underline font-medium">
                <RefreshCw size={12} /> Refresh
              </button>
            </div>

            {lostFoundItems.map((item) => (
              <div key={item.id} className="bg-white border border-slate-100 rounded-2xl p-4 space-y-2 shadow-sm">
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold text-slate-800 text-sm">{item.item_title}</h3>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium text-white ${
                    item.status === 'LOST' ? 'bg-[#800020]' : 'bg-emerald-600'
                  }`}>
                    {item.status}
                  </span>
                </div>
                {item.description && <p className="text-xs text-slate-500">{item.description}</p>}
                <p className="text-[11px] text-slate-400">Location: {item.location} • Contact: {item.reporter_name}</p>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* INSTAGRAM-STYLE FLOATING CHAT & NOTIFICATIONS BUTTON */}
      <button
        onClick={() => {
          setIsChatDrawerOpen(true);
          setHasUnreadNotifs(false);
        }}
        className="fixed bottom-5 right-5 bg-[#800020] text-white p-3.5 rounded-full shadow-2xl transition hover:scale-105 z-40 border-2 border-white flex items-center justify-center"
      >
        <MessageCircle size={22} />
        {hasUnreadNotifs && (
          <span className="absolute -top-1 -right-1 bg-red-500 w-3.5 h-3.5 rounded-full border-2 border-white animate-pulse" />
        )}
      </button>

      {/* INSTAGRAM-STYLE DIRECT MESSAGES & NOTIFICATIONS SIDE DRAWER */}
      {isChatDrawerOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex justify-end">
          <div className="bg-white w-full max-w-xs h-full flex flex-col shadow-2xl transition-all">
            {/* Drawer Header */}
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-[#800020] text-white">
              <div className="flex items-center gap-2">
                <MessageCircle size={18} />
                <h3 className="font-semibold text-sm">Direct Activity Chats</h3>
              </div>
              <button onClick={() => setIsChatDrawerOpen(false)} className="text-white/80 hover:text-white">
                <X size={18} />
              </button>
            </div>

            {/* Content Switcher: Chat List / Chat Window */}
            {!activeGroupChat ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Notifications Section */}
                <div className="space-y-2">
                  <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                    <Bell size={12} /> Recent Alerts
                  </h4>
                  {notifications.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">No new activity alerts.</p>
                  ) : (
                    notifications.map((notif) => (
                      <div key={notif.id} className="bg-amber-50 border border-amber-100 p-2.5 rounded-xl text-xs text-slate-700">
                        <p className="font-medium">{notif.text}</p>
                        <span className="text-[9px] text-slate-400">{notif.time}</span>
                      </div>
                    ))
                  )}
                </div>

                <hr className="border-slate-100" />

                {/* Group Conversations List */}
                <div className="space-y-2">
                  <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Your Activity Groups</h4>
                  {joinedChatGroups.length === 0 ? (
                    <div className="text-center py-8 text-xs text-slate-400">
                      <p>You haven't joined any event or carpool chats yet.</p>
                      <p className="text-[10px] mt-1 text-slate-300">Accept a ride or join an event to start chatting!</p>
                    </div>
                  ) : (
                    joinedChatGroups.map((group) => (
                      <button
                        key={group.id}
                        onClick={() => {
                          setActiveGroupChat(group);
                          fetchGroupMessages(group.id);
                        }}
                        className="w-full text-left bg-slate-50 hover:bg-slate-100 p-3 rounded-xl border border-slate-100 transition flex justify-between items-center group"
                      >
                        <div>
                          <p className="font-semibold text-xs text-slate-800 group-hover:text-[#800020] transition">{group.title}</p>
                          <span className="text-[10px] text-slate-400">{group.type} Group Chat</span>
                        </div>
                        <ChevronRight size={14} className="text-slate-300" />
                      </button>
                    ))
                  )}
                </div>
              </div>
            ) : (
              /* Active Chat Conversation Window */
              <div className="flex-1 flex flex-col h-full bg-slate-50">
                <div className="p-3 bg-white border-b border-slate-100 flex items-center gap-2">
                  <button onClick={() => setActiveGroupChat(null)} className="text-xs text-[#800020] font-semibold hover:underline">
                    ← Back
                  </button>
                  <span className="text-xs font-bold text-slate-800 truncate">{activeGroupChat.title}</span>
                </div>

                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {chatMessages.length === 0 ? (
                    <p className="text-center text-xs text-slate-400 py-8">No messages yet. Say hello to your group!</p>
                  ) : (
                    chatMessages.map((msg) => {
                      const isMe = msg.sender_name === currentUser.name;
                      return (
                        <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                          <span className="text-[9px] text-slate-400 mb-0.5">{msg.sender_name}</span>
                          <div className={`p-2.5 rounded-2xl max-w-[80%] text-xs ${
                            isMe ? 'bg-[#800020] text-white rounded-br-none' : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                          }`}>
                            {msg.message_text}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <form onSubmit={handleSendMessage} className="p-2 bg-white border-t border-slate-100 flex gap-2">
                  <input
                    type="text"
                    placeholder="Type a message..."
                    value={newMessageText}
                    onChange={(e) => setNewMessageText(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-[#800020]"
                  />
                  <button type="submit" className="bg-[#800020] text-white p-2 rounded-xl">
                    <Send size={14} />
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modals */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-base font-semibold text-slate-800">Host a Campus Event</h3>
            <form onSubmit={handleCreateEvent} className="space-y-3">
              <input
                type="text"
                required
                placeholder="Activity Title"
                value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
              />
              <input
                type="text"
                required
                placeholder="Campus Location"
                value={newEvent.location}
                onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
              />
              <select
                value={newEvent.category}
                onChange={(e) => setNewEvent({ ...newEvent, category: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 bg-slate-100 text-xs py-2.5 rounded-xl text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#800020] text-white text-xs py-2.5 rounded-xl font-medium"
                >
                  Publish
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showCarpoolModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-base font-semibold text-slate-800">Post Ride / Carpool</h3>
            <form onSubmit={handleCreateCarpool} className="space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setNewCarpool({ ...newCarpool, type: 'OFFER' })}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium ${
                    newCarpool.type === 'OFFER' ? 'bg-[#800020] text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  Offer Ride
                </button>
                <button
                  type="button"
                  onClick={() => setNewCarpool({ ...newCarpool, type: 'REQUEST' })}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium ${
                    newCarpool.type === 'REQUEST' ? 'bg-[#800020] text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  Need Ride
                </button>
              </div>
              <input
                type="text"
                required
                placeholder="Origin"
                value={newCarpool.origin}
                onChange={(e) => setNewCarpool({ ...newCarpool, origin: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
              />
              <input
                type="text"
                required
                placeholder="Destination"
                value={newCarpool.destination}
                onChange={(e) => setNewCarpool({ ...newCarpool, destination: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
              />
              <input
                type="text"
                required
                placeholder="Departure Time"
                value={newCarpool.departure_time}
                onChange={(e) => setNewCarpool({ ...newCarpool, departure_time: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCarpoolModal(false)}
                  className="flex-1 bg-slate-100 text-xs py-2.5 rounded-xl text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#800020] text-white text-xs py-2.5 rounded-xl font-medium"
                >
                  Post
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showLostFoundModal && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl">
            <h3 className="text-base font-semibold text-slate-800">Report Item</h3>
            <form onSubmit={handleReportItem} className="space-y-3">
              <input
                type="text"
                required
                placeholder="Item Title"
                value={newItem.item_title}
                onChange={(e) => setNewItem({ ...newItem, item_title: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
              />
              <input
                type="text"
                required
                placeholder="Location"
                value={newItem.location}
                onChange={(e) => setNewItem({ ...newItem, location: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800"
              />
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowLostFoundModal(false)}
                  className="flex-1 bg-slate-100 text-xs py-2.5 rounded-xl text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-[#800020] text-white text-xs py-2.5 rounded-xl font-medium"
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