/* 	
 Client-side logic for Wordpress CLI theme
 R. McFarland, 2006, 2007, 2008
 http://thrind.xamai.ca/
 
 jQuery rewrite and overhaul
 Chromakode, 2010
 http://www.chromakode.com/

 Minor hacking/extensions added Stephan Beal, 2010.
 http://wanderinghorse.net/

*/

var TerminalShell = {
	commands: {
		help: function help(terminal) {
			terminal.print(jQuery('<h3>Available commands:</h3>'));
			cmd_list = jQuery('<ul>');
			$.each(this.commands, function(name, func) {
                                   var a = jQuery('<a href="#">');
                                   a.text(name);
                                   a.click( function(e) { terminal.runCommand(name); } );
                                   var lbl = jQuery('<span>');
                                   lbl.append(a);
                                   if( 'shortHelp' in func )
                                   {
                                       lbl.append('&nbsp;&nbsp;--&gt;&nbsp;&nbsp;'+func.shortHelp);
                                   }
                                   cmd_list.append(jQuery('<li>').html(lbl));
			});
			terminal.print(cmd_list);
		}, 
		clear: function(terminal) {
			terminal.clear();
		}
	},
	filters: [],
	fallback: null,
	
	lastCommand: null,
	process: function(terminal, cmd) {
		try {
			$.each(this.filters, $.proxy(function(index, filter) {
				cmd = filter.call(this, terminal, cmd);
			}, this));
			var cmd_args = cmd.split(' ');
			var cmd_name = cmd_args.shift();
			cmd_args.unshift(terminal);
			this.lastCommand = cmd;
			if (this.commands.hasOwnProperty(cmd_name)) {
				this.commands[cmd_name].apply(this, cmd_args);
			} else {
				if (!(this.fallback && this.fallback(terminal, cmd))) {
					terminal.print('Unrecognized command. Type "help" for assistance.');
				}
			}
		} catch (e) {
			terminal.print(jQuery('<p>').addClass('error').text('Command "'+cmd+'" threw: '+e));
			terminal.setWorking(false);
		}
	}
};

var Terminal = {
	buffer: '',
	pos: 0,
	history: [],
	historyPos: 0,
	promptActive: true,
	cursorBlinkState: true,
	_cursorBlinkTimeout: null,
	spinnerIndex: 0,
	_spinnerTimeout: null,
	
	output: TerminalShell,
	
	config: {
		scrollStep:			20,
		scrollSpeed:		100,
		bg_color:			'#000',
		fg_color:			'#FFF',
		cursor_blink_time:	700,
		cursor_style:		'block',
		prompt:				'guest@console:/$ ',
		spinnerCharacters:	['[   ]','[.  ]','[.. ]','[...]'],
		spinnerSpeed:		250,
		typingSpeed:		50,
                select:{
                    screen:'#screen',
                    display:'#display',
                    prompt:'#prompt',
                    cursor:'#cursor',
                    inLine:'#inputline',
                    bottomLine:'#bottomline',
                    spinner:'#spinner',
                    lCommand:'#lcommand',
                    rCommand:'#rcommand'
                }
	},
	
	sticky: {
		keys: {
			ctrl: false,
			alt: false,
			scroll: false
		},
		
		set: function(key, state) {
			this.keys[key] = state;
			jQuery('#'+key+'-indicator').toggle(this.keys[key]);
		},
		
		toggle: function(key) {
			this.set(key, !this.keys[key]);
		},
		
		reset: function(key) {
			this.set(key, false);
		},
		
		resetAll: function(key) {
			$.each(this.keys, $.proxy(function(name, value) {
				this.reset(name);
			}, this));
		}
	},
	
	init: function() {
                var term = this;
		function ifActive(func) {
			return function() {
				if (term.promptActive) {
					func.apply(this, arguments);
				}
			};
		}
		jQuery(document)
			.keypress($.proxy(ifActive(function(e) {	
				if (e.which >= 32 && e.which <= 126) {   
					var character = String.fromCharCode(e.which);
					var letter = character.toLowerCase();
				} else {
					return;
				}
				
				if ($.browser.opera && !(/[\w\s]/.test(character))) {
					return; // sigh.
				}
				
				if (this.sticky.keys.ctrl) {
					if (letter == 'w') {
						this.deleteWord();
					} else if (letter == 'h') {
						term.deleteCharacter(false);
					} else if (letter == 'l') {
						this.clear();
					} else if (letter == 'a') {
						this.setPos(0);
					} else if (letter == 'e') {
						this.setPos(this.buffer.length);
					} else if (letter == 'd') {
						this.runCommand('logout');
					}
				} else {
					if (character) {
						this.addCharacter(character);
						e.preventDefault();
					}
				}
			}), this))
			.bind('keydown', 'return', ifActive(function(e) { term.processInputBuffer(); }))
			.bind('keydown', 'backspace', ifActive(function(e) { e.preventDefault();	term.deleteCharacter(e.shiftKey); }))
			.bind('keydown', 'del', ifActive(function(e) { term.deleteCharacter(true); }))
			.bind('keydown', 'left', ifActive(function(e) { term.moveCursor(-1); }))
			.bind('keydown', 'right', ifActive(function(e) { term.moveCursor(1); }))
			.bind('keydown', 'up', ifActive(function(e) {
				e.preventDefault();
				if (e.shiftKey || term.sticky.keys.scroll) {
					term.scrollLine(-1);
				} else if (e.ctrlKey || term.sticky.keys.ctrl) {
					term.scrollPage(-1);
				} else {
					term.moveHistory(-1);
				}
			}))
			.bind('keydown', 'down', ifActive(function(e) {
				e.preventDefault();
				if (e.shiftKey || term.sticky.keys.scroll) {
					term.scrollLine(1);
				} else if (e.ctrlKey || term.sticky.keys.ctrl) {
					term.scrollPage(1);
				} else {
					term.moveHistory(1);
				}
			}))
			.bind('keydown', 'pageup', ifActive(function(e) { term.scrollPage(-1); }))
			.bind('keydown', 'pagedown', ifActive(function(e) { term.scrollPage(1); }))
			.bind('keydown', 'home', ifActive(function(e) {
				e.preventDefault();
				if (e.ctrlKey || term.sticky.keys.ctrl) {
					term.jumpToTop();
				} else {
					term.setPos(0);
				}
			}))
			.bind('keydown', 'end', ifActive(function(e) {
				e.preventDefault();
				if (e.ctrlKey || term.sticky.keys.ctrl) {
					term.jumpToBottom();
				} else {
					term.setPos(term.buffer.length);
				}
			}))
			.bind('keydown', 'tab', function(e) {
				e.preventDefault();
			})
			.keyup(function(e) {
				var keyName = $.hotkeys.specialKeys[e.which];
				if (keyName in {'ctrl':true, 'alt':true, 'scroll':true}) {
					term.sticky.toggle(keyName);
				} else if (!(keyName in {'left':true, 'right':true, 'up':true, 'down':true})) {
					term.sticky.resetAll();
				}
			});

                var jqscr = jQuery(this.config.select.screen);
		jQuery(window).resize(function(e) { jqscr.scrollTop(jqscr.attr('scrollHeight')); });

		this.setCursorState(true);
		this.setWorking(false);
		jQuery(this.config.select.prompt).empty().append(this.config.prompt);
		jqscr.hide().fadeIn('fast', function() {
			jqscr.triggerHandler('cli-load');
		});
	},
	
	setCursorState: function(state, fromTimeout) {
		this.cursorBlinkState = state;
                var jqcurs = jQuery(this.config.select.cursor);
		if (this.config.cursor_style == 'block') {
			if (state) {
				jQuery(jqcurs).css({color:this.config.bg_color, backgroundColor:this.config.fg_color});
			} else {
				jQuery(jqcurs).css({color:this.config.fg_color, background:'none'});
			}
		} else {
			if (state) {
				jQuery(jqcurs).css('textDecoration', 'underline');
			} else {
				jQuery(jqcurs).css('textDecoration', 'none');
			}
		}
		
		// (Re)schedule next blink.
		if (!fromTimeout && this._cursorBlinkTimeout) {
			window.clearTimeout(this._cursorBlinkTimeout);
			this._cursorBlinkTimeout = null;
		}
		this._cursorBlinkTimeout = window.setTimeout($.proxy(function() {
			this.setCursorState(!this.cursorBlinkState, true);
		},this), this.config.cursor_blink_time);
	},
	
	updateInputDisplay: function() {
		var left = '', underCursor = ' ', right = '';

		if (this.pos < 0) {
			this.pos = 0;
		}
		if (this.pos > this.buffer.length) {
			this.pos = this.buffer.length;
		}
		if (this.pos > 0) {
			left = this.buffer.substr(0, this.pos);
		}
		if (this.pos < this.buffer.length) {
			underCursor = this.buffer.substr(this.pos, 1);
		}
		if (this.buffer.length - this.pos > 1) {
			right = this.buffer.substr(this.pos + 1, this.buffer.length - this.pos - 1);
		}

                var jqcurs = jQuery(this.config.select.cursor);
		jQuery(this.config.select.lCommand).text(left);
		jqcurs.text(underCursor);
		if (underCursor == ' ') {
			jqcurs.html('&nbsp;');
		}
		jQuery(this.config.select.rCommand).text(right);
		jQuery(this.config.select.prompt).empty().append(this.config.prompt);
		return;
	},
	
	clearInputBuffer: function() {
		this.buffer = '';
		this.pos = 0;
		this.updateInputDisplay();
	},
	
	clear: function() {
		jQuery(this.config.select.display).html('');
	},
	
	addCharacter: function(character) {
		var left = this.buffer.substr(0, this.pos);
		var right = this.buffer.substr(this.pos, this.buffer.length - this.pos);
		this.buffer = left + character + right;
		this.pos++;
		this.updateInputDisplay();
		this.setCursorState(true);
	},
	
	deleteCharacter: function(forward) {
		var offset = forward ? 1 : 0;
		if (this.pos >= (1 - offset)) {
			var left = this.buffer.substr(0, this.pos - 1 + offset);
			var right = this.buffer.substr(this.pos + offset, this.buffer.length - this.pos - offset);
			this.buffer = left + right;
			this.pos -= 1 - offset;
			this.updateInputDisplay();
		}
		this.setCursorState(true);
	},
	
	deleteWord: function() {
		if (this.pos > 0) {
			var ncp = this.pos;
			while (ncp > 0 && this.buffer.charAt(ncp) !== ' ') {
				ncp--;
			}
			left = this.buffer.substr(0, ncp - 1);
			right = this.buffer.substr(ncp, this.buffer.length - this.pos);
			this.buffer = left + right;
			this.pos = ncp;
			this.updateInputDisplay();
		}
		this.setCursorState(true);
	},
	
	moveCursor: function(val) {
		this.setPos(this.pos + val);
	},
	
	setPos: function(pos) {
		if ((pos >= 0) && (pos <= this.buffer.length)) {
			this.pos = pos;
			this.updateInputDisplay();
		}
		this.setCursorState(true);
	},
	
	moveHistory: function(val) {
		var newpos = this.historyPos + val;
		if ((newpos >= 0) && (newpos <= this.history.length)) {
			if (newpos == this.history.length) {
				this.clearInputBuffer();
			} else {
				this.buffer = this.history[newpos];
			}
			this.pos = this.buffer.length;
			this.historyPos = newpos;
			this.updateInputDisplay();
			this.jumpToBottom();
		}
		this.setCursorState(true);
	},
	
	addHistory: function(cmd) {
		this.historyPos = this.history.push(cmd);
	},

	jumpToBottom: function() {
                var jqscr = jQuery(this.config.select.screen);
		jqscr.animate({scrollTop: jqscr.attr('scrollHeight')}, this.config.scrollSpeed, 'linear');
	},

	jumpToTop: function() {
                var jqscr = jQuery(this.config.select.screen);
		jqscr.animate({scrollTop: 0}, this.config.scrollSpeed, 'linear');
	},
	
	scrollPage: function(num) {
                var jqscr = jQuery(this.config.select.screen);
		jqscr.animate({scrollTop: jqscr.scrollTop() + num * (jqscr.height() * .75)}, this.config.scrollSpeed, 'linear');
	},

	scrollLine: function(num) {
                var jqscr = jQuery(this.config.select.screen);
		jqscr.scrollTop(jqscr.scrollTop() + num * this.config.scrollStep);
	},

	print: function() {
            var prpush = arguments.callee.prpush;
            var pr = arguments.callee.pr;
            var self = this;
            if( ! prpush );
            {
                prpush = arguments.callee.prpush = function(jout,item) {
                    if( item instanceof Function ) item = item();
                    //if( jQuery.isArray(item) ) item = item.join(' ');
                    if( item ) jout.append(item);
                }
                pr = arguments.callee.pr = function(obj) {
                    jQuery(self.config.select.display).append(obj);
                    self.jumpToBottom();
                }

            }
            var out = jQuery('<div>');
            if(! arguments.length) {
                pr(out);
                return;
            }
            var av = Array.prototype.slice.call(arguments, [0]);
            var i = 0;
            for( ; i<av.length; ++i ) {
                prpush( out, av[i] );
                if( i != (av.length-1) ) prpush(out, ' ');
            }
            pr(out);
	},
        ltrim:function (value) {
             if (value) {
                 var re = /\s*((\S+\s*)*)/;
                 return value.replace(re, '$1');
             }
             return '';
        },
        rtrim:function(value) {
            /* rtrim(), ltrim(), trim() came from http://snippets.dzone.com/posts/show/701 */
	    if (value) {
                var re = /((\s*\S+)*)\s*/;
                return value.replace(re, '$1');
            }
            return '';
        },
	trim:function(value) {
                 return (value)
                 ? this.ltrim(this.rtrim(value))
                 : '';
        },
	processInputBuffer: function() {
                var prompt = (this.config.prompt instanceof jQuery)
                    ? this.config.prompt.clone(/*clone needed to avoid event-handling weirdness*/)
                    : ''+this.config.prompt;
                this.print(jQuery('<p>').addClass('command').append(prompt).append(this.buffer));
                var cmd = this.trim(this.buffer);
                this.clearInputBuffer();
		if (cmd.length == 0) {
			return false;
		}
		this.addHistory(cmd);
		if (this.output) {
			return this.output.process(this, cmd);
		} else {
			return false;
		}
	},
	
	setPromptActive: function(active) {
		this.promptActive = active;
		jQuery(this.config.select.inLine).toggle(this.promptActive);
	},
	
	setWorking: function(working) {
		if (working && !this._spinnerTimeout) {
			jQuery(this.config.select.display+' .command:last-child').add(this.config.select.bottomLine).first().append(jQuery(this.config.select.spinner));
			this._spinnerTimeout = window.setInterval($.proxy(function() {
				if (!jQuery(this.config.select.spinner).is(':visible')) {
					jQuery(this.config.select.spinner).fadeIn();
				}
				this.spinnerIndex = (this.spinnerIndex + 1) % this.config.spinnerCharacters.length;
				jQuery(this.config.select.spinner).text(this.config.spinnerCharacters[this.spinnerIndex]);
			},this), this.config.spinnerSpeed);
			this.setPromptActive(false);
			jQuery(this.config.select.screen).triggerHandler('cli-busy');
		} else if (!working && this._spinnerTimeout) {
			clearInterval(this._spinnerTimeout);
			this._spinnerTimeout = null;
			jQuery(this.config.select.spinner).fadeOut();
			this.setPromptActive(true);
			jQuery(this.config.select.screen).triggerHandler('cli-ready');
		}
	},

        /**
           Runs a command in the form "command [arg1 ... argN]".
           After it is run (if it is run and returns), if onCompletion
           is-a Function then it is called and passed this object.

           If command is an array it is assumed to be a list of
           command strings and they are run in order (stopping if any
           of them throws an exception). If
           
           TODO: refactor this to:

           - Do smarter tokenization by default, instead of simply
           split()ing on spaces.
        */
	runCommand: function(command,onCompletion) {
		this.promptActive = false;
                var self = this;
                function doList(av)
                {
                    var index = 0;
                    var item = av[0];
                    av.shift();
                    var interval = window.setInterval(
                           $.proxy(function typeCharacter() {
                                       if (index < item.length) {
                                           self.addCharacter(item.charAt(index));
                                           index += 1;
                                       } else {
                                           clearInterval(interval);
                                           self.processInputBuffer();
                                           if( av.length ) return doList(av);
                                           self.promptActive = true;
                                           if( onCompletion instanceof Function )
                                           {
                                               onCompletion(self);
                                           }
                                       }
                                   }, self), self.config.typingSpeed);
                }
                if( ! jQuery.isArray(command) )
                {
                    var x = ''+command;
                    command = [x];
                }
                doList(command);
	}
};

jQuery(document).ready(function() {
	// Kill Opera's backspace keyboard action.
	document.onkeydown = document.onkeypress = function(e) { return $.hotkeys.specialKeys[e.keyCode] != 'backspace'; };
	Terminal.init();
});
