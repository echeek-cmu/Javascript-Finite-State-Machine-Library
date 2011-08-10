/** A finite state machine library

@author Eric Cheek

TODO: 
 -improve error handling
 -streamline event binding (see prototype.js event selectors)

*/

/** 
 * @namespace Utility functions for FSM 
 * @ignore*/
var fsmutils={};

/** @private */
fsmutils.typeSwitch=function(){
    var argTypeError="Invalid argument type";

    return function(cases){
	return function(object){
	    var otype=typeof object;

	    if( otype in cases ){
		return cases[ typeof object ](object);
	    } else if( otype == "array" ){
		//if array, try processing sequentially
		object.map(arguments.callee);
	    } else if( 'default' in cases ){
		return cases[ 'default' ](object);
	    } else {
		throw argTypeError;
	    }
	};
    };
}();

/** @private */
fsmutils.setupObjFromObj=function(target, options, fallbackCallback){
    for(var key in options){
	if( typeof target[key] == "function"){
	    target[key]( options[key]);
	} else {
	    fallbackCallback.call(target, key, options[key]);
	}
    }

    return target;
}

/**
 * Documentation coming soon
 * @name FSMEventDispatcher
 * @class 
 */
var FSMEventDispatcher=function(){
    var dispatcher=this;

    //private variables
    var eventHandlers={};
    var eventQueue=[];
    var defaultContext=this;
    
    //exceptions (TODO: define object structure)
    var undefinedEvent="Undefined Event";

    /** @ignore */    
    var getCallbacks=function(eventName){
	var callbacks=[];
	for(var key in eventHandlers[eventName]){
	    var desc=eventHandlers[eventName][key];

	    // if there's no filter, or the filter passes, include the callback
	    if( !desc.filter ||  desc.filter() ){
		callbacks.push(desc);
	    }
	}
	return callbacks;
    };

    /** @ignore */
    var anonymousTrigger=function(eventName){
	var handler=function(data){
	    dispatcher.dispatchEvent(eventName, data);
	};
	return handler;
    };


    dispatcher.addEvent=function(eventName){
	if(!(eventName in eventHandlers) ){
	    eventHandlers[eventName]={};
	} else {
	    return dispatcher;
	}
	

	
	//create bind/trigger hook
	this[eventName]=function(obj, options){
	    return fsmutils.typeSwitch({
		"function" : function(callback){
		    dispatcher.bindEvent(eventName,callback,options);
		    //return bind builder
		    return dispatcher;
		},
		// if not passed a function, then trigger the event
		"default" : anonymousTrigger(eventName)
	    })(obj);
	};


	return dispatcher;
    };

    //shorthand function 
    dispatcher.getTrigger=function(eventName){
	addEvent(eventName);
	return anonymousTrigger(eventName);
    };

    dispatcher.bindEvent=function(eventName, callback, options){
	this.addEvent(eventName);

	var key=callback;
	if(options && options.id)
	    key=options.id;

	if( !eventHandlers[eventName][key] )
	    eventHandlers[eventName][key]={"callback":callback};

	var desc=eventHandlers[eventName][key];
	//set defaults
	desc.context=defaultContext;
	desc.id=key;

	if( options ){
	    if( options.filter ){
		//register a function to call to check if callback should be triggered
		desc.filter=options.filter;
	    }

	    desc.resultHandler=options.resultHandler;

	    if(options.context)
		desc.context=options.context;
	    
	}
	
	return dispatcher;
    };

    dispatcher.unbindEvent=function(eventName, funcOrId){
	if( funcOrId in eventHandlers[eventName] )
	    delete eventHandlers[eventName][funcOrId];

	return dispatcher;
    };
	
    dispatcher.dispatchEvent=function(eventName, data){
	eventQueue.push( {name:eventName, data:data});

	if( eventQueue.length >1 )
	    return dispatcher;

	while( eventQueue.length>0 ){
	    var event=eventQueue.shift();
	    
	    if( event.callback){
		event.callback();
		continue;
	    }

	    if( !(event.name in eventHandlers) ){
		//TODO: debug message for undefined event
		continue;
	    }

	    var handlers=getCallbacks(event.name);
	    for( var i in handlers){
		var desc=handlers[i];
		try{
		    var result=desc.callback.call(desc.context, event.data);
		    if( desc.resultHandler ){
			desc.resultHandler.call(desc.context, result, event.data);
		    }
		}catch(err){
		    alert(err);
		    //fsmutils.debug(err);
		}
	    }
	}
	return dispatcher;
    };

    //defers an action until all previously dispatched events are cleared
    dispatcher.deferAction=function(callback){
	if(eventQueue.length>1 ){
	    eventQueue.push( {callback:callback});
	}else {
	    callback();
	}
    };

    //misc settings
    dispatcher.setDefaultContext=function(obj){
	defaultContext=obj;
    };
};

/**
 * @class A finite state machine
 * @constructs
 * @param {object} configuration See {@link FSM.configure}
 */
var FSM=function(configuration){
    /** @ignore */ 
    var fsm=this;

    var currentState=null;
    var states={};
    var transitions={};

    //delimiter for events
    var tsign='=>';


    var allowUndefinedTransitions=false;

    /**
     * Allows accessor to underlying event dispatcher and event namespace
     * @name events
     * @memberOf FSM
     * @field
     * @type {FSMEventDispatcher}
     */
    fsm.events=new FSMEventDispatcher();
    fsm.events.setDefaultContext(fsm);

    /**
     * Reserved namespace for user-defined state variables
     * @name vars
     * @memberOf FSM
     * @field
     * @type {object}
     */
    this.vars={};
    




    //exceptions (TODO: define object exceptions)
    var InvalidTransition="Invalid transition";

    /**
     * Change machine state (or set initial state)
     * 
     * @name go
     * @memberOf FSM
     * @function
     * @param {string} nextState The state to transition to
     * @param {*} eventData The eventData used when triggering events
     */
    /** @ignore */
    fsm.go=function(endState, data){
	//sets the initial state, no check of transitions, can be called only once
	currentState=endState;
	fsm.events.dispatchEvent( states[currentState]._enterStateEvent, data);
	/** @private */
	fsm.go=function(endState, data){
	    var isReentry=(currentState==endState);
	    var oldState=states[currentState];

	    
	    //check this is valid transition
	    var trans=oldState._transitions[endState];
	    
	    var newState=null;
	    if( !trans && allowUndefinedTransitions ){
		//lookup in global table
		newState=states[endState];
	    } else {
		newState=trans._endState;
	    }
		    
	    if(!newState){
		throw InvalidTransition;
		return fsm;
	    }

	    //fire events for transition phases
	    var fire=fsm.events.dispatchEvent;

	    //exit event
	    if( !isReentry)
		fire(oldState._exitStateEvent, data);

	    //before event
	    if(trans)
		fire(trans._before, data);

	    //change state
	    fsm.events.deferAction( function(){
		currentState=newState._name;
	    });

	    //after event
	    if(trans)
		fire(trans._after, data);

	    //reentry event
	    if(isReentry)
		fire(newState._reentryEvent, data);

	    //enter event
	    if( !isReentry)
		fire(newState._enterStateEvent, data);

	    return fsm;
	};

	return fsm;
    };



    //state getter/configurator
    /**
     * Get or create a state.
     * @name state
     * @function
     * @memberOf FSM
     * @param {string} name Name Of state
     * @param {object} options State configuration object
     * @return {FSMState}
     * @example  fsm.state('initialized'); fsm.initialized.go();
     */
    /** @ignore */
    fsm.state=function(name, options){
	if( !states[name]){
	    states[name]=new FSMState(name);
	    fsm[name]=states[name];
	}	
	
	if(options){
	    states[name].configure(options);
	}

	return states[name];
    };



    /**
     * Get or create a transition
     * @name transition
     * @memberOf FSM
     * @function
     * @param {string} beginState The start state for the transition
     * @param {string} endState The end state for the transition
     * @param {options} options {@link FSMTransition.configure}
     * @return {object} {@link FSMTransition}
     */
    /** @ignore */
    fsm.transition=function(beginState, endState, options){
	beginState=fsm.state(beginState);
	//var endState=fsm.state(endState);
	var tran=beginState._transitions[endState];

	if( !tran ){
	    tran=new FSMTransition(beginState._name, endState);
	    transitions[tran.name]=tran;
	    beginState._transitions[endState]=tran;
	}
	
	if(options){
	    tran.configure(options);
	}

	return tran;
    };


    /** @ignore */
    var fsmOptionHandler=function(key, data){
	//TODO: handle special keyword options

	if( key.indexOf(tsign)!==-1 ){
	    var tstates= key.split(tsign);
	    fsm.transition(tstates[0], tstates[1], data);
	}else if( key=='states' ){
	    throw "Unimplemented";
	}else if( key=='transitions' ){
	    throw "Unimplemented";
	}else if( key=='events' ){
	    throw "Unimplemented";
	}else  if( key=='vars'){
	    throw "Unimplemented";
	}else {
	    fsm.state(key, data);
	}
    };

    /**
     * Associative-array based configuration
     * @name configure
     * @memberOf FSM
     * @function
     * @param {object} configuration
     * @config {string} [go] Sets initial state
     * @config {string} [*] Generic keyword treatment:<br/> If keyword
     * is of the form "{startState}=>{endState}", the setting is
     * interpreted as a transition configuration object. Otherwise the
     * key is treated as a state name and value as a state
     * configuration object.
     */
    /** @ignore */
    fsm.configure=function(configuration){
	fsmutils.setupObjFromObj(fsm, configuration, fsmOptionHandler);
    };

    /**
     * Enable/disable following undefined transitions
     * @name allowUndefinedTransitions
     * @memberOf FSM
     * @function
     * @param {boolean} yesNo If set to false (default), traversing an
     * undefined transition will an exception.
     */
    /** @ignore */
    fsm.allowUndefinedTransitions=function(yesno){
	allowUndefinedTransitions=yesno;
    };


    //utility function for getting state
    /**
     * Returns name of active state
     * @name getState
     * @memberOf FSM
     * @function
     * @return {string}
     */
    /** @ignore */
    fsm.getState=function(){ return currentState;};



    //utility function for event binding/unbinding
    /** @private */
    var addBinderFunction=function(addName, eventName, removeName){
	var self=this;
	fsm.events.addEvent(eventName);

	this[addName]=function(callback, options){
	    if(!options)
		options={};

	    if(!options.context)
		options.context=fsm;

	    fsm.events.bindEvent(eventName, callback, options);
	    return self;
	};


	/** @ignore */
	this[addName].remove=function( funcOrId){
	    fsm.events.unbindEvent(eventName,funcOrId);
	    return self;
	};
    };


    //state object
    /** @ignore */
    var FSMState=function(name){ 
	/**
	 * @name FSMState 
	 * @class Represents an FSM state
	 * @example //most functions are chainable.
	 * fsm.state('state1')
	 * .onEvent("action",function(){ alert(" action occured in state1 ");})
	 * .onExit(function(){ alert("leaving state1");});
	 * 
	 * 
	 */
	var state=this;

	/**#@+
	 * @memberOf FSMState
	 * @function
	 */

	this._name=name;
	this._transitions={};

	this._enterStateEvent="enterState:"+name;
	this._reenterStateEvent="reenterState:"+name;
	this._exitStateEvent="exitState:"+name;


	/**
	 * Fires after entering the state
	 * @name onEnter 
	 * @param {function} callback The callback to bind
	 * @return {FSMState}
	 */
	addBinderFunction.call(this, "onEnter",state._enterStateEvent);

	/**
	 * Fires before exiting the state
	 * @name onExit
	 * @param {function} callback The callback to bind
	 * @return {FSMState}
	 */
	addBinderFunction.call(this,"onExit",state._exitStateEvent);

	/**
	 * Fires when state is reentered
	 * @name onReentry
	 * @param {function} callback The callback to bind
	 * @return {FSMState}
	 */
	addBinderFunction.call(this,"onReentry",state._reentryEvent);

	/**
	 * Add a transition to a specified state
	 * @name addTransition
	 * @param {string} nextState The name of the transition's end state
	 * @param {options} options {@link FSMTransition.configure}
	 * @return {FSMState}
	 */
	/** @ignore */
	state.addTransition=function(nextState, options){
	    fsm.transition(state._name, nextState, options);

	    return state;
	};

	/**
	 * Get a transition object (if one exists)
	 * @name getTransition
	 * @param {string} nextState The name of the transition's end state
	 * @return {FSMTransition}
	 */
	/** @ignore */
	state.getTransition=function(nextState){
	    return state._transitions[nextState];
	};

	/**
	 * Jump to this state
	 * @name go
	 * @param {*} eventData The eventData passed to triggered event handlers
	 */
	/** @ignore */
	state.go=function(data){
	    fsm.go( state._name, data);
	};

	/** @ignore */
	var inStateFilter=function(){ return fsm.getState()==state._name;};
	/** @ignore */
	var stateResult=function(result, eventData){ 
	    if( typeof result == "string" ){
		fsm.go(result, eventData);
	    }
	};
	
	//TODO: prefix callback id with state name?
	/**
	 * Register an event handler that fires only if state is
	 * active
	 * @name onEvent
	 * @param {string} eventName The event to bind to
	 * @param {function} callback The callback to bind
	 * @param {object} options Options for binding the event
	 * @return {FSMState}
	 */
	/** @ignore */
	state.onEvent=function(eventName, callback, options){
	    if(!options)
		options={};

	    if(!options.context)
		options.context=fsm;

	    options.filter=inStateFilter;
	    if( !options.resultHandler )
		options.resultHandler=stateResult;

	    fsm.events.bindEvent(eventName, callback, options);
	    return state;
	};

	state.onEvent.remove=fsm.events.unbindEvent;
	//options handler for state configuration
	/** @ignore */
	var stateOptionHandler=function(key, data){
	    if( key.indexOf(tsign)==0 ){
		//treat key as =><endState>
		var endState=key.substring(2);
		if( typeof data == "object" ){
		    this.addTransition(endState, data);
		} else if (typeof data=="function"){
		    this.addTransition(endState);
		    this.getTransition(endState).transit(data);
		}

	    } else {
		//treat key as event name
		if( typeof data == "string"){
		    this.addTransition(data);
		    this.onEvent(key, function(e){ fsm.go(data,e);});
		}else if(typeof data=="function" ){
		    this.onEvent(key, data);
		}
	    }
	};

	/**
	 * Associative-array based configuration
	 * @name configure
	 * @param {object} options Configuration options
	 * @config {function} [onEnter] See {@link FSMState.onEnter}
	 * @config {function} [onReentry] See {@link FSMState.onReentry}
	 * @config {function} [onExit] See {@link FSMState.onExit}
	 * @config {object|function} [stateName] This option registers
	 * a transition to state stateName (Note: name must be
	 * prefixed with => to distinguish from events). If argument
	 * is an object, it passes configuration options to the
	 * transition (see {@link FSMTransition.configure}). If argument is
	 * a function, the function is bound to the transition's
	 * transit event.
	 * @config {string|function} [eventName] If argument is a
	 * string, then the event will trigger a transition to the
	 * state that name. If argument is a function, the argument is
	 * binded to the event (only within this state). If the
	 * function returns a string, the string specifices the state
	 * to go to next.
	 * @return {FSMState}
	 */
	/** @ignore */
	state.configure=function(settings){
	    fsmutils.setupObjFromObj(state, settings, stateOptionHandler);
	    return state;
	};
	
	/**#@-*/
	return state;
    };

    //transition object

    /** @ignore */
    var FSMTransition=function(startState, endState){
	/**
	 * @class Represents an FSM transition
	 * @name FSMTransition
	 */    
	var trans=this;
	this._name=startState+tsign+endState;
	this._startState=fsm.state(startState);
	this._endState=fsm.state(endState);
	
	//eventnames
	this._before="before:"+this._name;
	this._after="after:"+this._name;
	
	/**#@+
	 * @memberOf FSMTransition
	 * @function
	 */

	/**
	 * Fires before leaving the start state
	 * @name before
	 * @param {function} callback The callback to bind
	 */
	addBinderFunction.call(this, 'before',this._before);
	/**
	 * Fires after reaching the end state
	 * @name after
	 * @param {function} callback The callback to bind
	 */
	addBinderFunction.call(this, 'after', this._after);
	//alias after with transit
	/**
	 * Fires whenever the transition is crossed
	 * @name transit
	 * @param {function} callback The callback to bind
	 */
	this.transit=this.after;
	
	/** @ignore */
	var boolResult=function(result, eventData){
	    if( typeof result == "boolean" ){
		if(result)
		    trans._endState.go(eventData);
	    }
	};
	
	/**
	 * @name onEvent
	 * @param {string} eventName The event to bind to
	 * @param {boolean | function} boolOrCallback Boolean or
	 * boolean function that determines if transition should occur on event
	 * @return {FSMTransition}
	 */
	/** @ignore */
	trans.onEvent=function(eventName, boolOrCallback, options){
	    if(!options)
		options={};

	    if(!options.id)
		options.id=this._name;

	    if( typeof boolOrCallback == "boolean" && boolOrCallback){
		if( boolOrCallback ){
		    trans._startState.onEvent(eventName, trans._endState.go, options);
		} else{
		    trans._startState.onEvent.remove(eventName, this._name);
		}
	    }else if( typeof boolOrCallback == "function"){
		options.resultHandler=boolResult;
		trans._startState.onEvent(eventName, boolOrCallback, options);
	    }
	};

	trans.onEvent.remove=fsm.events.unbindEvent;
	
	/**
	 * @name configure
	 * @param {object} options 
	 * @return {FSMTransition}
	 * 
	 */
	/** @ignore */
	trans.configure=function(options){
	    fsmutils.setupObjFromObj(trans, options, trans.onEvent);
	    return trans;
	};

	/**#@-*/	
    };

    fsm.configure(configuration);

    return fsm;
};